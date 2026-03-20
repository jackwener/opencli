# Changelog

## [1.1.0](https://github.com/jackwener/opencli/compare/v1.0.6...v1.1.0) (2026-03-20)


### Features

* add antigravity serve command — Anthropic API proxy ([35a0fed](https://github.com/jackwener/opencli/commit/35a0fed8a0c1cb714298f672c19f017bbc9a9630))
* add arxiv and wikipedia adapters ([#132](https://github.com/jackwener/opencli/issues/132)) ([3cda14a](https://github.com/jackwener/opencli/commit/3cda14a2ab502e3bebfba6cdd9842c35b2b66b41))
* add external CLI hub for discovery, auto-installation, and execution of external tools. ([b3e32d8](https://github.com/jackwener/opencli/commit/b3e32d8a05744c9bcdfef96f5ff3085ac72bd353))
* add sinafinance 7x24 news adapter ([#131](https://github.com/jackwener/opencli/issues/131)) ([02793e9](https://github.com/jackwener/opencli/commit/02793e990ef4bdfdde9d7a748960b8a9ed6ea988))
* **boss:** add 8 new recruitment management commands ([#133](https://github.com/jackwener/opencli/issues/133)) ([7e973ca](https://github.com/jackwener/opencli/commit/7e973ca59270029f33021a483ca4974dc3975d36))
* **serve:** implement auto new conv, model mapping, and precise completion detection ([0e8c96b](https://github.com/jackwener/opencli/commit/0e8c96b6d9baebad5deb90b9e0620af5570b259d))
* **serve:** use CDP mouse click + Input.insertText for reliable message injection ([c63af6d](https://github.com/jackwener/opencli/commit/c63af6d41808dddf6f0f76789aa6c042f391f0b0))
* xiaohongshu creator flows migration ([#124](https://github.com/jackwener/opencli/issues/124)) ([8f17259](https://github.com/jackwener/opencli/commit/8f1725982ec06d121d7c15b5cf3cda2f5941c32a))


### Bug Fixes

* **docs:** use base '/' for custom domain and add CNAME file ([#129](https://github.com/jackwener/opencli/issues/129)) ([2876750](https://github.com/jackwener/opencli/commit/2876750891bc8a66be577b06ead4db61852c8e81))
* **serve:** update model mappings to match actual Antigravity UI ([36bc57a](https://github.com/jackwener/opencli/commit/36bc57a9624cdfaa50ffb2c1ad7f9c518c5e6c55))
* type safety for wikiFetch and arxiv abstract truncation ([4600b9d](https://github.com/jackwener/opencli/commit/4600b9d46dc7b56ff564c5f100c3a94c6a792c06))
* use UTC+8 for XHS timestamp formatting (CI timezone fix) ([03f067d](https://github.com/jackwener/opencli/commit/03f067d90764487f0439705df36e1a5c969a7f98))
* **xiaohongshu:** use fixed UTC+8 offset in trend timestamp formatting (CI timezone fix) ([593436e](https://github.com/jackwener/opencli/commit/593436e4cb5852f396fbaaa9f87ef1a0b518e76d))

## [1.0.6](https://github.com/jackwener/opencli/compare/v1.0.5...v1.0.6) (2026-03-20)


### Bug Fixes

* use %20 instead of + for spaces in Bilibili WBI signed requests ([#126](https://github.com/jackwener/opencli/issues/126)) ([4cabca1](https://github.com/jackwener/opencli/commit/4cabca12dfa6ca027b938b80ee6b940b5e89ea5c)), closes [#125](https://github.com/jackwener/opencli/issues/125)
