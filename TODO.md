# Immich Flutter Desktop TODO

- [ ] Reuse the existing Flutter tablet layout for a native Windows prototype. Verify sign-in, timeline browsing, original photo viewing, and video playback against an Immich server.
- [ ] Add macOS and Linux builds. Verify window resizing, keyboard and mouse input, file access, and packaging on each desktop platform.
- [ ] Track and close feature gaps between mobile and desktop, including albums, search, people, folder view, and backup. Use desktop folder selection for backup.
- [ ] Keep networking, file access, and playback behind platform interfaces so Flutter Web can be evaluated alongside desktop development. Consider replacing the Svelte web client after validating browser feature parity and large-library performance.
- [ ] Use [Immich discussion #14485](https://github.com/immich-app/immich/discussions/14485) to coordinate desktop compatibility work. Split upstream changes into focused PRs and verify existing Android and iOS behavior.
