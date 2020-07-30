from django.urls import path

from ..views.detail import Chat, ChatArchive, UserProfile
from ..views.edit import UserPreferences
from ..views.images import ImageList, ImageUpload, ImageDetailNginx, ImageDetailDevelopment
from ..views.list import ActivityList, ConversationArchiveList, ConversationList, PeopleList


urlpatterns_user = [
    # user related urls
    path("settings/", UserPreferences.as_view(), name="user_preferences"),
    path("people/", PeopleList.as_view(), name="people"),
    path("activity/", ActivityList.as_view(), name="activity"),
    path("messages/", ConversationList.as_view(), name="messages"),
    path("messages/archive/", ConversationArchiveList.as_view(), name="messages-archive"),
    path("messages/<slug:slug>/", Chat.as_view(), name="conversation"),
    path("messages/archive/<slug:slug>/", ChatArchive.as_view(), name="conversation-archive"),
    path("author/<slug:slug>/", UserProfile.as_view(), name="user-profile"),
    path("author/<slug:slug>/<slug:tab>/", UserProfile.as_view(), name="user-profile-stats"),
    path("myimages/", ImageList.as_view(), name="image-list"),
    path("upload/", ImageUpload.as_view(), name="image-upload"),
    path("img/<slug:slug>", ImageDetailDevelopment.as_view(), name="image-detail"),
]
