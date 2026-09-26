# wild-gunman-grok-wechat

WeChat Mini Game port of [wild-gunman-grok](https://github.com/volvetech/wild-gunman-grok) (Noon Duel).

The web game is React + Vite + DOM. WeChat Mini Games have no DOM. This repo keeps a standalone Canvas project under `minigame/` that you open in WeChat DevTools.

## Open in WeChat DevTools

1. Install [WeChat DevTools](https://developers.weixin.qq.com/minigame/dev/devtools/download.html).
2. Copy sprites from the web repo:

```bash
cp -R ../wild-gunman-grok/public/sprites minigame/sprites
```

If that folder is missing, the game still runs with drawn stand-ins.

3. DevTools → New project → Mini Game → directory `minigame`.
4. AppID: use a test AppID first, then your game-category AppID.
5. Compile and preview on a phone.

## What works now

- Title: Classic / Two-gun / Endless
- Standoff → FIRE → shoot on the body hitbox
- Early shot = chicken, late shot = they fire once
- Result panel, three lives, wx storage for high score
- Sound via `wx.createInnerAudioContext` when `audio/` files exist

## Package limit

Main package must stay under 4MB. Keep only one scene + two gunmen in the main pack; put extra scenes in a subpackage later.

## Publish

Register a Mini Program with category **Game** on [mp.weixin.qq.com](https://mp.weixin.qq.com/), finish software copyright + filing, then upload from DevTools.
