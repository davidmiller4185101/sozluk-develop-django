from contextlib import suppress

from django.contrib import messages as notifications
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _, gettext_lazy as _lazy
from django.views.generic import DetailView, ListView

from ..forms.edit import MementoForm, SendMessageForm
from ..models import Author, Conversation, ConversationArchive, Entry, Memento, Message
from ..utils.decorators import cached_context
from ..utils.managers import UserStatsQueryHandler, entry_prefetch
from ..utils.mixins import IntegratedFormMixin
from ..utils.settings import ENTRIES_PER_PAGE_PROFILE


class Chat(LoginRequiredMixin, IntegratedFormMixin, DetailView):
    model = Conversation
    template_name = "dictionary/conversation/conversation.html"
    form_class = SendMessageForm
    context_object_name = "conversation"

    def get_recipient(self):
        return get_object_or_404(Author, slug=self.kwargs.get("slug"))

    def form_valid(self, form):
        recipient = self.get_recipient()
        message = Message.objects.compose(self.request.user, recipient, form.cleaned_data["body"])

        if not message:
            notifications.error(self.request, _("we couldn't send your message"))
            return self.form_invalid(form)

        return redirect(reverse("conversation", kwargs={"slug": self.kwargs.get("slug")}))

    def form_invalid(self, form):
        for err in form.non_field_errors() + form.errors.get("body", []):
            notifications.error(self.request, err)

        return super().form_invalid(form)

    def get_object(self, queryset=None):
        recipient = self.get_recipient()
        chat = self.model.objects.with_user(self.request.user, recipient)

        if chat is not None:
            # Mark read
            chat.messages.filter(sender=recipient, read_at__isnull=True).update(read_at=timezone.now())
            return chat

        raise Http404  # users haven't messaged each other yet

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["recipient"] = self.object.target
        context["can_send_message"] = self.request.user.can_send_message(self.object.target)
        context["is_blocked"] = self.request.user.blocked.filter(pk=self.object.target.pk).exists()
        return context


class ChatArchive(LoginRequiredMixin, DetailView):
    template_name = "dictionary/conversation/conversation_archive.html"

    def get_object(self, queryset=None):
        return get_object_or_404(ConversationArchive, holder=self.request.user, slug=self.kwargs["slug"])


class UserProfile(IntegratedFormMixin, ListView):
    model = Entry
    paginate_by = ENTRIES_PER_PAGE_PROFILE
    form_class = MementoForm
    template_name = "dictionary/user/profile.html"

    profile = None
    tab = None

    tabs = {
        "latest": {"label": _lazy("entries"), "type": "entry"},
        "favorites": {"label": _lazy("favorites"), "type": "entry"},
        "popular": {"label": _lazy("most favorited"), "type": "entry"},
        "liked": {"label": _lazy("most liked"), "type": "entry"},
        "weeklygoods": {"label": _lazy("attracting entries of this week"), "type": "entry"},
        "beloved": {"label": _lazy("beloved entries"), "type": "entry"},
        "authors": {"label": _lazy("favorite authors"), "type": "author"},
        "recentlyvoted": {"label": _lazy("recently voted"), "type": "entry"},
        "wishes": {"label": _lazy("wishes"), "type": "topic"},
        "channels": {"label": _lazy("contributed channels"), "type": "category"},
    }

    def form_valid(self, form):
        existing_memento = self.get_memento()
        body = form.cleaned_data.get("body")
        if existing_memento:
            if not body:
                existing_memento.delete()
                notifications.info(self.request, _("just deleted that"))
            else:
                existing_memento.body = body
                existing_memento.save()
        else:
            if not body:
                notifications.info(self.request, _("if only you could write down something"))
            else:
                memento = form.save(commit=False)
                memento.holder = self.request.user
                memento.patient = self.profile
                memento.save()
        return redirect(reverse("user-profile", kwargs={"slug": self.profile.slug}))

    def get_form_kwargs(self):
        # To populate textarea with existing memento data
        kwargs = super().get_form_kwargs()
        if self.request.method not in ("POST", "PUT"):
            memento = self.get_memento()
            if memento:
                kwargs.update({"data": {"body": memento.body}})
        return kwargs

    def get_queryset(self):
        handler = UserStatsQueryHandler(self.profile, requester=self.request.user, order=True)
        qs = getattr(handler, self.tab)()
        tab_obj_type = self.tabs.get(self.tab)["type"]

        if tab_obj_type == "entry":
            return entry_prefetch(qs, self.request.user)

        if tab_obj_type in ("author", "topic", "category"):
            return qs

        raise Http404

    def get_context_data(self, *args, **kwargs):
        context = super().get_context_data(*args, **kwargs)
        context["tab"] = {"name": self.tab, **self.tabs.get(self.tab)}
        context["profile"] = self.profile
        context["novice_queue"] = self.get_novice_queue()
        return context

    def dispatch(self, request, *args, **kwargs):
        self.profile = get_object_or_404(Author, slug=self.kwargs.get("slug"), is_active=True)

        # Check accessibility
        if (
            self.profile.is_frozen
            or self.profile.is_private
            or (
                self.request.user.is_authenticated
                and (
                    self.profile.blocked.filter(pk=self.request.user.pk).exists()
                    or self.request.user.blocked.filter(pk=self.profile.pk).exists()
                )
            )
        ):
            raise Http404

        tab = kwargs.get("tab")

        if tab is not None and tab not in self.tabs.keys():
            raise Http404

        self.tab = tab or "latest"
        return super().dispatch(request)

    def get_novice_queue(self):
        sender = self.request.user
        if (
            sender.is_authenticated
            and sender == self.profile
            and sender.is_novice
            and sender.application_status == "PN"
        ):
            queue = cached_context(prefix="nqu", vary_on_user=True, timeout=86400)(lambda user: user.novice_queue)
            return queue(user=sender)
        return None

    def get_memento(self):
        if self.request.user.is_authenticated:
            with suppress(Memento.DoesNotExist):
                return Memento.objects.get(holder=self.request.user, patient=self.profile)

        return None
