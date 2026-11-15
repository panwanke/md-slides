"""Local account and deck store for jc-slide-studio.

Backend-agnostic by design: the HTTP layer and the front end only see the
``DeckStore``-shaped payloads. Replacing SQLite with a hosted database later
does not change the API contract or the editor kernel.
"""
