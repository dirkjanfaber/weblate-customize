"""Victron defaults for Weblate that have no setting.

Mounted as the apps.py of Weblate's "customize" app (see docker-compose.yml).
"""

from django.apps import AppConfig
from django.db.models.signals import post_save, pre_save


def zen_side_by_side(sender, instance, **kwargs):
    """New users translate in Zen, side by side: English left, translation right.

    "Translation editor mode" decides where the numbers in the lists of
    projects, components and languages lead; the full editor stays one click
    away (the pencil on each string, "Exit Zen").
    """
    if instance._state.adding:
        instance.translate_mode = sender.TRANSLATE_ZEN
        instance.zen_mode = sender.ZEN_HORIZONTAL


def watch_all_projects(sender, instance, created, **kwargs):
    """New users watch every project they may see.

    The dashboard shows only watched projects, and Weblate watches one only
    after a first translation in it, so a new translator's dashboard was empty.
    """
    if created:
        instance.watched.add(*instance.user.allowed_projects)


class CustomizeConfig(AppConfig):
    name = "customize"

    def ready(self):
        from weblate.accounts.models import Profile

        pre_save.connect(zen_side_by_side, sender=Profile)
        post_save.connect(watch_all_projects, sender=Profile)
