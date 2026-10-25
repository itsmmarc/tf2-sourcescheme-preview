# TF2 SourceScheme Preview

A VS Code extension that previews a Team Fortress 2 HUD's `resource/sourcescheme.res`. It draws mock versions of the server browser, options dialog and console from the scheme, updating live as the user types. Clicking any element shows every color, font, border and string behind it, each linked to its definition.

It also has a border preview: one resizable panel drawn with borders from `resource/clientscheme.res` or `resource/sourcescheme.res` and its `#base` chain (a sourcescheme chain ends with the built-in `SourceSchemeBase.res`; a file in both chains uses the ClientScheme).

Repo: https://github.com/itsmmarc/tf2-sourcescheme-preview (default branch `main`). Current version is 0.6.9.

## Build and install

- `python pack.py` builds `dist/tf2-sourcescheme-preview-<version>.vsix`. It needs only Python 3: no Node, no `vsce`, no build step.
- `pack.py` packs a fixed list of files: `package.json`, `extension.js`, `README.md`, `LICENSE`, `lib/hud.js`, `lib/vpk.js` and every file directly in `media/`. New files elsewhere must be added to that list.
- Install with `code --install-extension dist/<file>.vsix`.
- Bump `"version"` in `package.json` for each release.

## Layout

| File | Role |
|---|---|
| `extension.js` | Extension host. Opens the webview panels (`Preview` for SourceScheme, `BorderPreview` for ClientScheme or SourceScheme borders), loads the `#base` chains, sends fonts, images, HUD strings and options layouts, watches files, creates `sourcescheme.res` from the empty state's button. Registers the commands, including the right-click menu ones, the border CodeLens and the `tf2SchemeFile` context key. |
| `lib/hud.js` | Plain Node, no VS Code APIs. Finds the HUD (`findHud`: the folder with `info.vdf`, falling back to the nearest `resource/sourcescheme.res`), creates a scheme (`createScheme`), loads the options layouts (`loadLayouts`: `resource/optionssub<tab>.res` and their `#base`s), resolves paths case-insensitively, follows `#base` (`loadChain`), loads `CustomFontFiles`, finds image borders (`readImage`: HUD first, then the game's files), and parses `resource/chat_english.txt` (`loadStrings`). For the border preview: `clientEntryFor` (the clientscheme.res, or another scheme by name, whose chain holds a file), `schemeEntryFor` (clientscheme, then sourcescheme) and `bordersIn` (border definitions in a file, for the CodeLens). |
| `lib/vpk.js` | The game's own files: a VPK v1/v2 reader, `findGame` (the `tf2SourceScheme.teamFortress2Folder` setting, then `vscode-vdf.teamFortress2Folder`, a folder above the HUD, Steam libraries from `libraryfolders.vdf`) and `gameFiles` (tf then hl2, loose files before `*_textures_dir.vpk` and `*_misc_dir.vpk`). Tested only on synthetic VPKs. |
| `media/kv.js` | KeyValues tokenizer and parser, plus `#base` resolution and merging. Shared by host and webview. |
| `media/scheme.js` | `Scheme`: merged colors, base settings, fonts (picks `yres` entries), borders, problem list. |
| `media/preview.js` | The renderer: all three dialogs, scheme→CSS, the `CONTROLS` table (which scheme keys each control reads, with fallbacks), interaction, resizing, string tokens (`TOK`), and the HUD layout engine (`setLayouts`, `layoutRects`, `layoutPage`, `LAYOUT_BIND`, `CVARS`). |
| `media/gameui_strings.js` | The game's English text for every `GameUI_` token (generated from `hl2/resource/gameui_english.txt` in GameTracking-TF2), for `#GameUI_*` labels in layout files. |
| `media/webview.js` | Webview chrome: toolbar, zoom, sidebar inspector, state persistence, messages from the host. |
| `media/borders.js`, `media/borders.css` | The border preview webview (ClientScheme or SourceScheme; the host sends `kind` and `engineKey`): one border, or three slots with the "Button borders" checkbox; border dropdowns in the side panel (things the game reads), preview-only settings in the toolbar (Button borders, Show inset, bgcolor dropdown over scheme colors, wide/tall fields, zoom); the resizable panel with hover/press states. Draws with `Preview.lineLayers` and `Preview.imageBorderCss` from `preview.js`. The CodeLens always shows Preview · Armed · Selected; Armed and Selected turn Button borders on. |
| `media/vgui.css`, `media/webview.css` | Mock dialog styles and webview chrome styles. |
| `media/fonts.js`, `media/vtf.js` | Font loading and substitution; VTF texture decoding for image borders. |
| `media/engine_base.res` | The game's real `SourceSchemeBase.res`, built in as the end of every `#base` chain. |

Host→webview messages: `scheme`, `font`, `image`, `strings`, `layouts` (`[{ tab, files, missing }]`), `showTab` (an options tab, when its `optionssub*.res` is opened or typed in), `settings` (screen height), `zoom` (`in`/`out`/`fit`/`reset`), `resetSize`, `empty` (`hud`: the HUD's name when it has an `info.vdf` but no scheme, which shows the create button). Webview→host: `ready`, `open`, `image`, `state`, `createScheme`. The border preview gets `scheme`, `image`, `settings`, `empty` and `border` (`name` and `slot` 0–2, from a CodeLens link). It doesn't follow the editor cursor; the user found that clunky.

Contributed commands are `tf2SourceScheme.openPreview`, `openBorderPreview` (editor title, when `tf2SchemeFile`), `previewBorder` (CodeLens only), plus `zoomIn`, `zoomOut`, `zoomFit`, `zoomReset` and `resetWindowSize`. All but the first appear only in `webview/context`, scoped by `webviewId == 'tf2SourceScheme.preview'`; Reset Window Size also needs `tf2Resizable`, set through `data-vscode-context` on resizable frames.

The setting `tf2SourceScheme.screenHeight` defaults to 1440. `tf2SourceScheme.teamFortress2Folder` (empty = auto-detect) points at the game for stock materials.

## How the game works: confirmed rules (keep these)

Sources: Source SDK 2013 (`ValveSoftware/source-sdk-2013`, `src/vgui2/vgui_controls/*.cpp`; the current TF2 64-bit code, which uses `QuickPropScale`), and pixel measurements from the user's 1440p in-game screenshots.

**Scaling**
- `SC = screenHeight / 1080`. Positions, sizes and font heights are all scaled by it.
- Scaling truncates, as `GetProportionalScaledValueEx` does: `px(v) = floor(v * SC)`. For example, 512 becomes 682 and 80 becomes 106 at 1440p.
- Fonts pick their `yres` entry for the screen height, and that entry's `tall` is then scaled too.

**Frame** (`Frame::GetClientArea`)
- `x = Frame.ClientInsetX`, in pixels, not scaled.
- `y = px(ClientInsetY) + titleFontTall + px(7) + px(1)`.
- Client height is `(H - px(ClientInsetY)) - y`; client width is `W - 2 * ClientInsetX`.
- The title text sits at `px(Frame.TitleTextInsetX)`.

**PropertySheet tabs**
- The tab row is `px(28)` tall.
- The active tab is `px(28) - 1` tall, 2px from the top; inactive tabs are 2px shorter, 4px from the top. These offsets aren't scaled.
- Tabs are 1px apart.
- `tabxfittotext` is on by default, so width = text + 3 × `px(6)` (the Button text inset) + `px(8)`, with text west-aligned at `px(6)` and no minimum width. "Lan" is 59px wide in-game.
- The page starts at `px(28)`.

**PropertyDialog** (options)
- 512 × 406, fixed size.
- The sheet is the client area less `px(32)` at the bottom.
- Buttons are `px(72)` × `px(24)`, `px(80)` apart, at `x + wide - px(80)` and `y + tall - px(28)`.

**ListPanel** (server list)
- Column headers are as tall as the scroll bar is wide (`ScrollBar.Wide`, scaled).
- The scroll bar sits at `w - sbW - 2px`, full height less 2px.
- Rows are `fontTall + 2` tall and start at `headerH + 1`.
- The last column reaches the scroll bar.

**SectionedListPanel** (options key list)
- Items start 5px in (`px(5)` in the preview; in-game measures about 7px at 1440p, unresolved), with width `w - 10 - sbW`.
- A section header is its font + 7 tall, with a 1px divider 2px from its bottom.
- Rows are `linespacing` 20 (scaled); sections are `px(8)` apart.
- The action column is `px(286)` wide, and first-column text is indented 6px.

**Console** (`CConsolePanel`)
- Default size 640 × 440; the panel's minimum is 100 × 100.
- Insets are `px(8)`, entry height `px(24)`, top `px(4)`, entry inset `px(4)`, Submit width `px(64)`, Submit inset `px(7)`.
- Errors and warnings are drawn in `255 90 90`, a color the game uses itself rather than reading from the scheme.

**Server browser**
- Its own code isn't public.
- Default and minimum size are 640 × 384.
- When resized, the list grows; filters and the bottom row are pinned to the bottom; buttons on the right and the tags box's right edge are pinned to the right. This matches the user's resized in-game window to within 1–2px.
- The list's rows and headers use `DefaultSmall` (user-confirmed; PR #1).
- The Game filter dropdown can't be opened.
- The Workshop, Latency, Anti-cheat and Location dropdowns list `<All>` first but show blank when it's picked.

**Image borders** (`scalable_image`)
- `draw_corner_width`/`draw_corner_height` scale by the classic 480-line proportional base, not 1080: `floor(v * screenHeight / 480)`. So 4 draws 12px at 1440p, measured from the user's in-game screenshot (12px corners, 12px stretched edge, 12px corners on a 36px active tab).
- Nine pieces, as `ScalableImagePanel::PaintBackground`: corners take `src_corner / texture size` of the UVs and the middle `max(1 - 2 × that, 0)`. A texture that's all corners (64px, 32px corners) gets edges and a centre stretched from the line where the corners meet (bilinear, so the average of the two texels). The preview rebuilds the texture that way (`nineSlice`) and feeds it to CSS `border-image ... fill`.
- `color` tints the texture by multiplying it (vertex color). `LoadoutItemPopupBorder` (white `tintable_round_64x`, color Black) draws a solid black rounded panel in-game. `color`'s alpha doesn't apply (user-checked in-game); only its RGB tints.
- `src_corner_*` are texture pixels and aren't scaled. The source corner is stretched to the draw size, so a draw size bigger than the source corner looks blurry or pixelated in-game too.

**Line borders** (`Border::Paint`; matches the user's 1440p screenshot of a 3-line `ButtonDepressedBorder` pixel for pixel in layout)
- Lines are 1px, in screen pixels, never scaled. Line i of a side is i px in from that edge.
- Each line runs the side's full length less its `offset` "start end" (top/left end first). Lines from different sides cross at the corners.
- Paint order is left, top, right, bottom, each line blended over what's already there (including other lines and the control's own background).
- The border paints after the control's children (it's on top of a combo's arrow button, a list's scroll bar).
- `inset` doesn't move the lines. It offsets and shrinks the area the control's contents (text) paint in; background and border ignore it.
- The preview paints a small model of the border in JS and lays it out as nine background pieces on a `::after` (on the element itself for `<input>`s). Inset is a transparent CSS border on `.ctl.ab` controls and inputs; tabs are left out, since their width comes from the text alone.

**Panel keys read from any border** (`Panel::SetBorder`, `Panel::PaintTraverse`, `Panel::DrawBox`; checked against the user's 1440p screenshot of a `paintfirst` white image `TabActiveBorder`)
- `backgroundtype 2` rounds the panel's own background, not the border: `PaintBackground` draws it with `DrawBox`, four `vgui/hud/8x800corner*` quarter-circle textures in the background color. Corners are `max(floor(8 × screenHeight / 480) / 2, 8)` px, so 12px at 1440p. The border stays square, so a border painted under the background shows in the corners. `0` (default) is a plain rect; `1` is a single texture.
- `paintfirst 1` paints the border before the background and text instead of after the children. The background then blends over the border: `29 26 32 217` over the 241 white gave 104 in-game, in linear light. The preview puts such image borders on a `::before` under a `::after` copy of the background, blended over the texture's average color (`imageMean`). Line borders ignore `paintfirst` in the preview.

**Button border keys** (`CExButton::GetBorder`, `src/game/client/econ/econ_controls.cpp`)
- HUD buttons read `border_default`, `border_armed`, `border_selected` and `border_disabled`. There is no `border_depressed`.
- Order: disabled (if set) → selected (if set and selected) → armed (if set and armed) → `border_default` (if set) → `Button::GetBorder`, which gives `ButtonDepressedBorder` when depressed and `ButtonBorder` otherwise.
- Pressing a button calls `SetSelected(true)` (`Button::OnMousePressed`), which also clears armed unless `stay_armed_on_click`. So while held it draws `border_selected`, else `border_default`, else `ButtonDepressedBorder`; `border_armed` doesn't show while pressed.
- HUD panels scale by screen height ÷ 480, so the border preview shows `wide`/`tall` in those units.

**HUD layout files** (`resource/optionssub*.res`; matches the user's 1440p mouse and video screenshots to the pixel in position)
- Sizes and positions follow `ComputeWide`/`ComputeTall`/`ComputePos` in `Panel.cpp` (the current TF2 code): `r`/`c` alignment, `s`/`p` proportional prefixes, `+`/`-` operators between terms (`"100-23"`, `"254+5"`), `f`/`p`/`o`/`s` sizes, `proportionalToParent` (else the parent size is the screen). Proportional values truncate toward zero (`-1` is `-1`px at 1440p, measured).
- Children are placed relative to the tab page, which starts at the sheet's client x and `y + px(28)`.
- **Pinning** is in `vgui2/src` (not public). Measured: the two corners meet, then xpos/ypos move the panel *away from the sibling's corner*: + is right/down from a right/bottom corner, left/up from a left/top one. A label pinned top-left→top-left with ypos 18 sits 18 above its slider; a slider pinned top-left→bottom-left with ypos 20 sits 20 below. Center corners are assumed to add (unchecked).
- `CCvarSlider` made from the file (has `minvalue`/`maxvalue`/`cvar_name`): captions are its range as `%.2f`, clamped to the cvar's limits (`mat_monitorgamma` 1.6–2.6, `mat_monitorgamma_tv_exp` 1–4), ignoring `leftText`/`rightText`. Sliders the game makes in code keep the file's `leftText`/`rightText`. `numTicks` is the number of gaps (11 marks by default).
- The game hides `VRModeLabel`/`VRMode` on the video tab whatever the file says (user-confirmed from the screenshot).
- `URLButton` draws a button background (`Button.BgColor`) with underlined text and no border (measured).
- GameUI can't make TF2's client classes (`CExLabel`, `CExButton`), so those aren't drawn. Unknown types are listed on the tab page's inspector.
- A tab without a HUD file uses the built-in copy of the stock layout (the game's own files aren't read for this).

**Other**
- Tabs have no hover state; while pressed they draw `Button.SelectedBgColor`.
- Translucent colors are blended in linear light, which matches in-game pixels to about 1 level.

## HUD strings (`resource/chat_english.txt`)

- The file is UTF-16LE with a BOM (UTF-8 is also handled), shaped `"lang" { "Tokens" { ... } }`. `[english]` keys are skipped.
- `preview.js` `TOK` maps stock English text to its token. It was generated from the game's English files in `SteamDatabase/GameTracking-TF2`: `gameui_english`, `valve_english`, `tf_english`, `platform/servers/serverbrowser_english` and `platform/resource/vgui_english`.
- `Preview.L(text)` returns the HUD's value or the stock text. `&` hotkey marks are stripped and `\n` becomes a line break. Elements carry `data-tok`, and the sidebar's Text section shows the token, its source line and its status.
- Tested in-game by the user:
  - **Applied:** `GameUI_*`, `PropertyDialog_*` (OK/Cancel/Apply use these), `Valve_*` and `TF_*` (the key list).
  - **Ignored by TF2:** `ServerBrowser_*` and `Console_*`. These are in `FIXED_TOKENS`; the preview keeps the stock text and the sidebar warns if the HUD sets them.
- The cause isn't known. It is *not* per source file: `PropertyDialog_*` works but `Console_Submit` doesn't, and both come from `vgui_english`. Follow the user's tests rather than guessing.

## Webview behavior worth knowing

- Clicking an element picks it for the inspector *after* the click is handled and the dialog re-rendered, using the element now under the pointer with the same `data-c`. `markPicked` prefers the element at the last click point.
  - This fixed a bug where clicking a lower server row outlined the first one.
- Resizing works by dragging the right edge, bottom edge or the grip. The drag maps pointer distance to layout units through the zoom (`hooks.zoom`) and `SC`.
  - Fit zoom is frozen during a drag.
  - Sizes are saved in the webview state (`sizes`).
  - Double-clicking an edge or the grip resets the size.
- Zoom options are Fit, presets, Ctrl+scroll, and the right-click menu. Zoom In/Out step through 25%–400% around the point that was right-clicked.

## Testing approach

- There's no unit test suite. Changes are checked by rendering in headless Chromium with Playwright and measuring pixel runs against the user's in-game screenshots.
- Playwright needs `executablePath` pointing at the preinstalled Chromium.
- The harness:
  - Writes a page that loads `media/*.js` with a stub `acquireVsCodeApi`.
  - Posts `settings` (1440), `scheme` and optionally `strings` messages.
  - Uses a fixture HUD scheme with `#base "SourceSchemeBase.res"`. Without the `#base`, the engine defaults don't apply.
- To smoke-test `extension.js`, load it with a stubbed `vscode` module and check that every contributed command registers.
- Webview context menus can't be tested headlessly. Check them against the VS Code docs or in a real editor.

## Console and server browser layouts

- The console (`CConsoleDialog`/`CConsolePanel`) has no .res file: its layout is all in `PerformLayout`. A HUD can only change its colors and fonts.
- The server browser does have .res files, in `platform/servers/` (`dialogserverbrowser.res`, `internetgamespage.res`, `internetgamespage_filters.res`, `customgamespage.res`, `blacklistedserverspage.res`, ...). Whether TF2 loads a HUD's copy hasn't been tested; it ignores a HUD's `ServerBrowser_*` strings, so it may not.

## Inspector

- The Borders section shows the border's name, chain and file link, an image border's texture and color, and only undefined line colors. Per-side lines, offsets, `paintfirst`, `inset` and `backgroundtype` rows were removed at the user's request (both the SourceScheme sidebar and the border preview's side panel).

## Still approximate or open

- The key list's x inset is `px(5)`; the game shows about 7px at 1440p.
- Exact section header heights depend on the user's header font, which hasn't been checked.
- Tab widths depend on the HUD's `Default` font, and the `px(8)` buffer may round differently in the engine.
- Whether a parent's border inset also shifts its child panels (lists, frames) hasn't been checked; the preview doesn't shift them.
- Of the user's HUD files, only their `optionssubmouse.res` and `optionssubvideo.res` have been loaded here (as layout fixtures). Fonts substitute if they aren't in the HUD or installed.

## About the user

- Plays at 2560 × 1440. Their HUD uses a custom `chat_english.txt` with upper-case option strings.
- TF2 is at `D:\Program Files (x86)\Steam\steamapps\common\Team Fortress 2\tf`.
- Tests behavior in-game and reports results. Prefers being asked when the game's behavior is uncertain over guessing.
- Gives feedback through in-game vs preview screenshots.
