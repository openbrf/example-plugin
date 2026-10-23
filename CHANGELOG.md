# Changelog

## 0.2.0

- A `processing` declaration in the manifest: the purpose, the legal basis
  (legitimate interest, with the interest stated), how long the data is kept
  (it is not kept) and whose data it is (members and residents), as ADR 0035
  of Open BRF defines it. An instance that implements ADR 0035 shows it to the
  board on the consent screen and lets a person object to this processing on
  its own. An earlier instance, and `@openbrf/plugin-sdk` 1.0.0, which this
  version is built and checked against, ignore the field, so the plugin
  installs and works there as 0.1.0 does. Version 0.1.0 was released without
  it.
- Nothing else changes: the view, the settings and the `summary` action are as
  in 0.1.0.

## 0.1.0

The first release.

- A view that counts the association's apartments, residents and members, and
  lists the apartments by address or by floor with how many people are
  registered as living in each and how many of them hold the tenant-ownership.
  An apartment with no resident the plugin can see is marked, so the board knows
  where to look. The view says that people with protected personal data and
  people whose processing is restricted are never passed to a plugin, so a
  marked apartment is not necessarily empty. Under the floor grouping each row
  gives its address, since an apartment number is only unique per address.
- Four settings: a heading of the board's own, whether the member count shows,
  the grouping the list opens with, and how many apartments it lists.
- One action, `summary`, which returns the three counts and names nobody,
  offered on the platform's own screens and, once an administrator arms it, to
  connected apps.
- Swedish and English.
