from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy

from ..models import Category, Entry
from ..utils.settings import VOTE_RATES
from ..utils.views import JsonView


class EntryAction(LoginRequiredMixin, JsonView):
    http_method_names = ['get', 'post']
    owner_action = False
    redirect_url = None
    entry = None
    success_message = "oldu bu iş"

    def handle(self):
        action = self.request_data.get("type")

        try:
            self.entry = get_object_or_404(Entry, id=int(self.request_data.get("entry_id")))
        except (ValueError, TypeError, Entry.DoesNotExist):
            return self.bad_request()

        self.owner_action = self.entry.author == self.request.user
        self.redirect_url = reverse_lazy("topic", kwargs={"slug": self.entry.topic.slug}) if self.request_data.get(
            "redirect") == "true" else None

        if action in ("delete", "pin"):
            # This block returns either success or failure
            return getattr(self, action)()

        if action in ("favorite", "favorite_list"):
            # This block returns data
            self.data = getattr(self, action)()

        return super().handle()

    def delete(self):
        if self.owner_action:
            self.entry.delete()
            self.success_message = "silindi"
            if self.redirect_url:
                return self.success(message_pop=True, redirect_url=self.redirect_url)
            return self.success()

        return self.error()

    def pin(self):
        if self.owner_action:
            if self.request.user.pinned_entry == self.entry:  # unpin
                self.request.user.pinned_entry = None
            else:
                self.request.user.pinned_entry = self.entry
            self.request.user.save()
            return self.success()
        return self.error()

    def favorite(self):
        if self.entry in self.request.user.favorite_entries.all():
            self.request.user.favorite_entries.remove(self.entry)
            self.entry.update_vote(VOTE_RATES["reduce"])
            status = -1
        else:
            self.request.user.favorite_entries.add(self.entry)
            self.entry.update_vote(VOTE_RATES["increase"])
            status = 1

        return {"count": self.entry.favorited_by.count(), "status": status}

    def favorite_list(self):
        users_favorited = self.entry.favorited_by.all()
        authors, novices = [], []
        for user in users_favorited:
            if user.is_novice:
                novices.append(user.username)
            else:
                authors.append(user.username)
        return {"users": [authors, novices]}


class CategoryAction(LoginRequiredMixin, JsonView):
    http_method_names = ["post"]
    category_object = None

    def handle(self):
        action = self.request_data.get("type")

        try:
            self.category_object = Category.objects.get(pk=int(self.request_data.get("category_id")))
        except (ValueError, OverflowError, Category.DoesNotExist):
            return self.bad_request()

        if action in ["follow"]:
            return self.follow()

        return self.bad_request()

    def follow(self):
        if self.category_object in self.request.user.following_categories.all():
            self.request.user.following_categories.remove(self.category_object)
        else:
            self.request.user.following_categories.add(self.category_object)

        return self.success()


class Vote(JsonView):
    """
    Anonymous users can vote, in order to hinder duplicate votings, session is used; though it is not
    the best way to handle this, I think it's better than storing all the IP adresses of the guest users as acquiring an
    IP adress is a nuance; it depends on the server and it can also be manipulated by keen hackers. It's just better to
    stick to this way instead of making things complicated as there is no way to make this work 100% intended.
    """
    http_method_names = ['post']

    # View specific attributes
    vote = None
    entry = None
    already_voted = False
    already_voted_type = None
    anonymous = True
    anon_votes = None
    cast_up = None
    cast_down = None

    def handle(self):
        self.vote = self.request_data.get("vote")
        self.cast_up = self.vote == "up"
        self.cast_down = self.vote == "down"

        try:
            self.entry = get_object_or_404(Entry, id=int(self.request_data.get("entry_id")))
        except (ValueError, OverflowError):
            return self.error()

        if self.request.user.is_authenticated:
            # self-vote not allowed
            if self.request.user == self.entry.author:
                return self.error()
            self.anonymous = False

        if self.vote in ["up", "down"]:
            if self.cast():
                return self.success()

        return super().handle()

    def cast(self):
        entry, cast_up, cast_down = self.entry, self.cast_up, self.cast_down
        decrease, increase = VOTE_RATES["reduce"], VOTE_RATES["increase"]

        if self.anonymous:
            k = VOTE_RATES["anonymous_multiplier"]
            self.anon_votes = self.request.session.get("anon_votes")
            if self.anon_votes:
                for record in self.anon_votes:  # do not use the name 'record' method's this scope
                    if record.get("entry_id") == entry.id:
                        self.already_voted = True
                        self.already_voted_type = record.get("type")
                        break
        else:
            k = VOTE_RATES["authenticated_multiplier"]
            sender = self.request.user
            if entry in sender.upvoted_entries.all():
                self.already_voted = True
                self.already_voted_type = "up"
            elif entry in sender.downvoted_entries.all():
                self.already_voted = True
                self.already_voted_type = "down"

        if self.already_voted:
            if self.already_voted_type == self.vote:
                # Removes the vote cast.
                if cast_up:
                    entry.update_vote(decrease * k)
                elif cast_down:
                    entry.update_vote(increase * k)
            else:
                # Changes the vote cast.
                if cast_up:
                    entry.update_vote(increase * k, change=True)
                if cast_down:
                    entry.update_vote(decrease * k, change=True)
        else:
            # First time voting.
            if cast_up:
                entry.update_vote(increase * k)
            elif cast_down:
                entry.update_vote(decrease * k)

        if self.record_vote():
            return True
        return False

    def record_vote(self):
        entry, cast_up, cast_down = self.entry, self.cast_up, self.cast_down
        prior_cast_up = self.already_voted_type == "up"
        prior_cast_down = self.already_voted_type == "down"

        if self.anonymous:
            anon_votes_new = []
            if self.already_voted:
                anon_votes_new = [y for y in self.anon_votes if y.get('entry_id') != entry.id]
                if self.already_voted_type != self.vote:
                    anon_votes_new.append({"entry_id": entry.id, "type": self.vote})
            else:
                if self.anon_votes:
                    self.anon_votes.append({"entry_id": entry.id, "type": self.vote})
                    anon_votes_new = self.anon_votes
                else:
                    anon_votes_new.append({"entry_id": entry.id, "type": self.vote})

            self.request.session["anon_votes"] = anon_votes_new

        else:
            sender = self.request.user
            if self.already_voted:
                if prior_cast_up and cast_up:
                    sender.upvoted_entries.remove(entry)
                elif prior_cast_down and cast_down:
                    sender.downvoted_entries.remove(entry)
                elif prior_cast_up and cast_down:
                    sender.upvoted_entries.remove(entry)
                    sender.downvoted_entries.add(entry)
                elif prior_cast_down and cast_up:
                    sender.downvoted_entries.remove(entry)
                    sender.upvoted_entries.add(entry)
            else:
                if cast_up:
                    sender.upvoted_entries.add(entry)
                elif cast_down:
                    sender.downvoted_entries.add(entry)
        return True
