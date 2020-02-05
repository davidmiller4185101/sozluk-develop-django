from django import template
from django.urls import reverse

from ..models import Entry, TopicFollowing
from ..utils.settings import FLATPAGE_URLS, SOCIAL_URLS

register = template.Library()

"""
Make sure you restart the Django development
server every time you modify template tags.
"""


@register.simple_tag
def url_replace(request, field, value):
    dict_ = request.GET.copy()
    dict_[field] = value
    return dict_.urlencode()


@register.simple_tag
def entry_full_url(req, entry_id):
    return req.build_absolute_uri(reverse('entry-permalink', kwargs={'entry_id': entry_id}))


@register.simple_tag
def check_follow_status(user, topic):
    return TopicFollowing.objects.filter(topic=topic, author=user).exists()


@register.simple_tag
def check_category_follow_status(user, category):
    return category in user.following_categories.all()


@register.simple_tag
def activity_latest_entry(sender, topic):
    return topic.latest_entry_date(sender)


@register.simple_tag
def url_flat(name):
    try:
        return Entry.objects.get(pk=FLATPAGE_URLS[name]).get_absolute_url()
    except Entry.DoesNotExist:
        return "/entry/1/"


@register.simple_tag
def url_social(name):
    return SOCIAL_URLS[name]
