from django.db import models
from django.db.models import Q


class EntryManager(models.Manager):
    # Includes ONLY the PUBLISHED entries by NON-NOVICE authors
    def get_queryset(self):
        # also for çaylar todo
        return super().get_queryset().exclude(Q(is_draft=True) | Q(author__is_novice=True))


class EntryManagerAll(models.Manager):
    # Includes ALL entries (entries by novices, drafts)
    pass


class EntryManagerOnlyNovices(models.Manager):
    def get_queryset(self):
        return super().get_queryset().exclude(author__is_novice=False)


class EntryManagerOnlyPublished(models.Manager):
    # Includes ONLY the PUBLISHED entries (entries by NOVICE users still visible)
    use_for_related_fields = True

    def get_queryset(self):
        return super().get_queryset().exclude(is_draft=True)
