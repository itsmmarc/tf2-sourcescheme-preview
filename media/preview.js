// ---------------------------------------------------------------------------
// Live preview: the server browser, options dialog and console, drawn from
// the scheme. Controls are placed at the positions in TF2's stock layout
// files (servers/*.res, resource/optionssub*.res) and sized the way the
// Source SDK 2013 vgui_controls code sizes them (Frame, PropertyDialog,
// PropertySheet, CConsolePanel).
//
// CONTROLS lists, per control, the scheme keys it reads and the fallback it
// uses when a key is missing, from each control's ApplySchemeSettings.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';
  const { rgbaCss } = root.SchemeLib;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fcls = name => 'f-' + String(name).replace(/[^A-Za-z0-9_-]/g, '_');
  const bcls = name => 'b-' + String(name).replace(/[^A-Za-z0-9_-]/g, '_');
  const W = [255, 255, 255, 255];
  const CLEAR = [0, 0, 0, 0];
  // Layout scale: TF2 scales its UI dialogs by screen height / 1080; font sizes stay in pixels.
  // GetProportionalScaledValueEx truncates (512 -> 682 at 1440p, 80 -> 106), so this does too.
  // Fonts are scaled the same way: in-game text, title bars and the key list's
  // section headers all come out screen height / 1080 times their "tall".
  let SC = 1;
  const px = v => Math.floor(v * SC + 1e-6);

  // [scheme key, what it paints, fallback (rgba or another key) when missing]
  const TEXTENTRY = [
    ['TextEntry.TextColor', 'Text', W], ['TextEntry.BgColor', 'Background', W],
    ['TextEntry.CursorColor', 'Cursor', W], ['TextEntry.SelectedTextColor', 'Text, selected', 'TextEntry.TextColor'],
    ['TextEntry.SelectedBgColor', 'Selection background', W], ['TextEntry.OutOfFocusSelectedBgColor', 'Selection background, unfocused', W],
    ['TextEntry.FocusEdgeColor', 'Focus edge', CLEAR],
    ['TextEntry.DisabledTextColor', 'Text, disabled', W], ['TextEntry.DisabledBgColor', 'Background, disabled', W],
  ];
  const BUTTON = [
    ['Button.TextColor', 'Text', W], ['Button.BgColor', 'Background', [0, 0, 0, 255]],
    ['Button.ArmedTextColor', 'Text, hover', 'Button.TextColor'], ['Button.ArmedBgColor', 'Background, hover', 'Button.BgColor'],
    ['Button.DepressedTextColor', 'Text, pressed', 'Button.TextColor'], ['Button.DepressedBgColor', 'Background, pressed', 'Button.BgColor'],
    ['Button.FocusBorderColor', 'Keyboard focus outline', [0, 0, 0, 255]],
    ['Label.DisabledFgColor1', 'Text, disabled', W], ['Label.DisabledFgColor2', 'Text shadow, disabled', W],
  ];
  const BUTTON_BORDERS = [['ButtonBorder', 'Border'], ['ButtonDepressedBorder', 'Border, pressed'], ['ButtonKeyFocusBorder', 'Border, default button or keyboard focus']];
  const CONTROLS = {
    frame: { name: 'Window', keys: [['Frame.BgColor', 'Background', W], ['Frame.OutOfFocusBgColor', 'Background, window unfocused', 'Frame.BgColor'],
      ['Frame.ClientInsetX', 'Content inset, sides (pixels)'], ['Frame.ClientInsetY', 'Content inset, top and bottom (pixels)']], borders: [['FrameBorder', 'Border']] },
    title: { name: 'Window title', keys: [['FrameTitleBar.TextColor', 'Text', W], ['FrameTitleBar.DisabledTextColor', 'Text, window unfocused', W], ['FrameTitleBar.BgColor', 'Background', W], ['FrameTitleBar.DisabledBgColor', 'Background, window unfocused', W],
      ['FrameTitleBar.Font', 'Font name setting'], ['Frame.TitleTextInsetX', 'Text inset (pixels)']], fonts: ['@title'] },
    titlebtn: { name: 'Window close button', keys: [['FrameTitleButton.FgColor', 'Icon', W], ['FrameTitleButton.BgColor', 'Background', W], ['FrameTitleButton.DisabledFgColor', 'Icon, window unfocused', W], ['FrameTitleButton.DisabledBgColor', 'Background, window unfocused', W]],
      borders: [['TitleButtonBorder', 'Border'], ['TitleButtonDepressedBorder', 'Border, pressed'], ['TitleButtonDisabledBorder', 'Border, window unfocused']], fonts: ['Marlett'] },
    grip: { name: 'Window resize grip', keys: [['FrameGrip.Color1', 'Light dots', W], ['FrameGrip.Color2', 'Dark dots', W]] },
    tab: { name: 'Tab', keys: [['PropertySheet.TextColor', 'Text', 'Button.TextColor'], ['PropertySheet.SelectedTextColor', 'Text, active tab', 'Button.TextColor'],
      ['Button.BgColor', 'Background', [0, 0, 0, 255]], ['Button.SelectedBgColor', 'Background, pressed', CLEAR]],
      borders: [['TabBorder', 'Border'], ['TabActiveBorder', 'Border, active tab']], fonts: ['Default'],
      note: 'Tabs never use the hover colors. While the mouse button is held down a tab is "selected", so it draws with Button.SelectedBgColor (not Button.DepressedBgColor), which is transparent when unset.' },
    sheet: { name: 'Tab page area', keys: [], borders: [['PropertySheetBorder', 'Border']] },
    button: { name: 'Button', keys: BUTTON, borders: BUTTON_BORDERS, fonts: ['Default'] },
    toggle: { name: 'Toggle button', keys: [...BUTTON, ['ToggleButton.SelectedTextColor', 'Text, switched on', W]], borders: BUTTON_BORDERS, fonts: ['Default'],
      note: 'While switched on it stays pressed, so it uses the pressed background.' },
    url: { name: 'Link button', keys: [['Button.TextColor', 'Text', W], ['Button.ArmedTextColor', 'Text, hover', 'Button.TextColor']], fonts: ['Default'],
      note: 'URLButton\'s source isn\'t public; drawn here as underlined button text.' },
    colhead: { name: 'List column header', keys: BUTTON, borders: BUTTON_BORDERS, fonts: ['DefaultSmall'],
      note: 'The server browser\'s list headers use the DefaultSmall font.' },
    list: { name: 'List', keys: [['ListPanel.BgColor', 'Background', W], ['ListPanel.EmptyListInfoTextColor', 'Text, empty list message', W]], borders: [['ButtonDepressedBorder', 'Border']], fonts: ['Default'] },
    row: { name: 'List row', keys: [['ListPanel.TextColor', 'Text', W], ['ListPanel.SelectedTextColor', 'Text, selected', 'ListPanel.TextColor'],
      ['ListPanel.SelectedBgColor', 'Background, selected', W], ['ListPanel.SelectedOutOfFocusBgColor', 'Background, selected, window unfocused', W], ['ListPanel.BgColor', 'Background', W]],
      fonts: ['DefaultSmall'], note: 'The server browser\'s list rows use the DefaultSmall font.' },
    slist: { name: 'Key list', keys: [['SectionedListPanel.BgColor', 'Background', W]], borders: [['ButtonDepressedBorder', 'Border']] },
    shead: { name: 'Key list section header', keys: [['SectionedListPanel.HeaderTextColor', 'Text', W], ['SectionedListPanelHeader.BgColor', 'Background', CLEAR], ['SectionedListPanel.DividerColor', 'Divider line', W]], fonts: ['DefaultVerySmall'] },
    srow: { name: 'Key list row', keys: [['SectionedListPanel.TextColor', 'Text', W], ['SectionedListPanel.BrightTextColor', 'Text, key column', W],
      ['SectionedListPanel.SelectedTextColor', 'Text, selected', W], ['SectionedListPanel.SelectedBgColor', 'Background, selected', W],
      ['SectionedListPanel.OutOfFocusSelectedTextColor', 'Text, selected, window unfocused', W], ['SectionedListPanel.OutOfFocusSelectedBgColor', 'Background, selected, window unfocused', W], ['SectionedListPanel.Font', 'Font name setting']], fonts: ['@slfont'] },
    menu: { name: 'Menu', keys: [['Menu.BgColor', 'Background', W], ['Menu.SeparatorColor', 'Separator line', [142, 142, 142, 255]]], borders: [['MenuBorder', 'Border']] },
    mitem: { name: 'Menu item', keys: [['Menu.TextColor', 'Text', W], ['Menu.BgColor', 'Background', W], ['Menu.ArmedTextColor', 'Text, hover', 'Menu.TextColor'], ['Menu.ArmedBgColor', 'Background, hover', 'Menu.BgColor'], ['Menu.TextInset', 'Text inset (pixels)']], fonts: ['Default'] },
    tip: { name: 'Tooltip', keys: [['Tooltip.TextColor', 'Text', W], ['Tooltip.BgColor', 'Background', W]], borders: [['ToolTipBorder', 'Border']], fonts: ['DefaultSmall'] },
    sbbtn: { name: 'Scroll bar arrow button', keys: [['ScrollBarButton.FgColor', 'Arrow', W], ['ScrollBarButton.BgColor', 'Background', W], ['ScrollBarButton.ArmedFgColor', 'Arrow, hover', W], ['ScrollBarButton.ArmedBgColor', 'Background, hover', W],
      ['ScrollBarButton.DepressedFgColor', 'Arrow, pressed', W], ['ScrollBarButton.DepressedBgColor', 'Background, pressed', W], ['ScrollBar.Wide', 'Scroll bar width (pixels)']],
      borders: [['ScrollBarButtonBorder', 'Border'], ['ScrollBarButtonDepressedBorder', 'Border, pressed']], fonts: ['Marlett'] },
    sbslider: { name: 'Scroll bar', keys: [['ScrollBarSlider.FgColor', 'Handle', W], ['ScrollBarSlider.BgColor', 'Track', W], ['ScrollBar.Wide', 'Width (pixels)']], borders: [['ScrollBarSliderBorder', 'Handle border (ButtonBorder if missing)']] },
    check: { name: 'Checkbox', keys: [['CheckButton.TextColor', 'Text', W], ['CheckButton.SelectedTextColor', 'Text, checked', W], ['CheckButton.HighlightFgColor', 'Text, hover', [62, 70, 55, 255]],
      ['CheckButton.ArmedBgColor', 'Background, hover', [62, 70, 55, 255]], ['CheckButton.DepressedBgColor', 'Background, pressed', [62, 70, 55, 255]],
      ['CheckButton.BgColor', 'Box', [62, 70, 55, 255]], ['CheckButton.Border1', 'Box edge, top and left', [20, 20, 20, 255]], ['CheckButton.Border2', 'Box edge, bottom and right', [90, 90, 90, 255]],
      ['CheckButton.Check', 'Tick', [20, 20, 20, 255]], ['CheckButton.DisabledFgColor', 'Tick, disabled', [130, 130, 130, 255]], ['CheckButton.DisabledBgColor', 'Box, disabled', [62, 70, 55, 255]],
      ['Label.DisabledFgColor1', 'Text, disabled', W], ['Label.DisabledFgColor2', 'Text shadow, disabled', W]], fonts: ['Default', 'Marlett'] },
    label: { name: 'Label', keys: [['Label.TextColor', 'Text', W], ['Label.BgColor', 'Background', W]], fonts: ['Default'] },
    labeldull: { name: 'Label (dull)', keys: [['Label.TextDullColor', 'Text', W], ['Label.BgColor', 'Background', W]], fonts: ['Default'] },
    labeldis: { name: 'Label (disabled)', keys: [['Label.DisabledFgColor1', 'Text', W], ['Label.DisabledFgColor2', 'Text shadow', W], ['Label.BgColor', 'Background', W]], fonts: ['Default'] },
    entry: { name: 'Text box', keys: TEXTENTRY, borders: [['ButtonDepressedBorder', 'Border']], fonts: ['Default'] },
    combo: { name: 'Dropdown', keys: [...TEXTENTRY, ['ComboBoxButton.ArrowColor', 'Arrow', W], ['ComboBoxButton.ArmedArrowColor', 'Arrow, hover or pressed', W], ['ComboBoxButton.BgColor', 'Arrow background', W], ['ComboBoxButton.DisabledBgColor', 'Arrow background, disabled', W]],
      borders: [['ComboBoxBorder', 'Border']], fonts: ['Default', 'Marlett'] },
    slider: { name: 'Slider', keys: [['Slider.NobColor', 'Handle', W], ['Slider.TrackColor', 'Track', 'Slider.NobColor'], ['Slider.TextColor', 'Ticks and end labels', 'Slider.NobColor'],
      ['Slider.DisabledTextColor1', 'Ticks and labels, disabled', 'Slider.NobColor'], ['Slider.DisabledTextColor2', 'Ticks and labels shadow, disabled', 'Slider.NobColor']],
      borders: [['ButtonBorder', 'Handle border'], ['ButtonDepressedBorder', 'Track border']], fonts: ['DefaultVerySmall'] },
    divider: { name: 'Divider line', keys: [], borders: [['ButtonDepressedBorder', 'Line (drawn as a border)']] },
    image: { name: 'Image', keys: [], borders: [['DepressedBorder', 'Border']] },
    console: { name: 'Console output', keys: [['RichText.BgColor', 'Background', W], ['Console.TextColor', 'Text, including typed commands', W], ['Console.DevTextColor', 'Developer messages', W],
      ['RichText.SelectedTextColor', 'Text, selected', 'RichText.TextColor'], ['RichText.SelectedBgColor', 'Selection background', W]],
      borders: [['DepressedButtonBorder', 'Border (the console asks for this name)']], fonts: ['ConsoleText'],
      note: 'Errors and warnings are printed in 255 90 90 by the game itself, not from the scheme.' },
    centry: { name: 'Console input', keys: TEXTENTRY, borders: [['DepressedButtonBorder', 'Border (the console asks for this name)']], fonts: ['Default'] },
  };
  const BORDERS = [...new Set(Object.values(CONTROLS).flatMap(c => (c.borders || []).map(b => b[0])))];

  // ---------- icons (stand-ins for Marlett and server browser glyphs) ----------
  const ICON = {
    close: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    down: '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M1 3h8L5 8z" fill="currentColor"/></svg>',
    up: '<svg viewBox="0 0 10 10" width="9" height="9"><path d="M1 7h8L5 2z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 12 12" width="100%" height="100%"><path d="M2.2 6.4l2.5 2.5 5.1-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="square"/></svg>',
    lock: '<svg viewBox="0 0 10 12" width="8" height="10"><path d="M2.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" fill="none" stroke-width="1.3"/><rect x="1" y="5" width="8" height="6" fill="currentColor"/></svg>',
    vac: '<svg viewBox="0 0 10 12" width="9" height="10"><path d="M5 .8L9 2.4v3.4C9 8.4 7.3 10.3 5 11.2 2.7 10.3 1 8.4 1 5.8V2.4z" fill="currentColor"/></svg>',
    replay: '<svg viewBox="0 0 12 10" width="10" height="9"><rect x="1" y="1" width="10" height="8" rx="1" fill="none" stroke="currentColor"/><path d="M5 3l3 2-3 2z" fill="currentColor"/></svg>',
  };

  // ---------- sample content ----------
  const SERVERS = [
    // [password, vac, name, game, players, bots, map, latency, tags]
    [0, 1, "Potato's MvM Bauernhof Archive server #302 [AUS]", 'Team Fortress (Wave 4/7)', '1 / 6', '', 'mvm_shadows_boss', '21', 'alltalk,arcade'],
    [0, 1, 'SYD Casual #2 | 2Fort Only', 'Team Fortress', '31 / 32', '', 'ctf_2fort', '26', 'alltalk,nocrits'],
    [0, 1, 'jump.tf (Sydney) | All Maps #1', 'Team Fortress', '1 / 24', '', 'jump_rocky_c8', '28', 'alltalk,norespawntime'],
    [0, 1, 'Rottenburg Rejects | Harvest AUS', 'Team Fortress', '2 / 24', '', 'koth_harvest_event', '35', 'alltalk,halloween'],
    [0, 1, 'Teufort Tavern | TOWER DEFENSE', 'Tower Defense (2.0.2)', '1 / 64', '8', 'td_rampant_v4_f', '35', 'alltalk,bots'],
    [1, 1, 'Brass Beast Scrims (pw)', 'Team Fortress', '12 / 12', '', 'cp_process_f12', '41', 'competitive'],
    [0, 1, 'Mann Co. Monday | Rank 500 Only', 'Team Fortress', '1 / 24', '', 'jump_areae_b2', '36', 'alltalk,norespawntime'],
    [0, 1, 'Gravel Pit Academy #1 | Jump', 'Team Fortress', '2 / 24', '1', 'jump_academy2_v2', '39', 'academy,jump'],
  ];
  const SB_TABS = [
    { name: 'Internet', empty: 'No internet games responded to the query.', rows: SERVERS, tags: true },
    { name: 'Favorites', empty: 'You currently have no favorite servers selected.', rows: [], add: true },
    { name: 'History', empty: 'No servers have been played recently.', rows: SERVERS.slice(1, 3), history: true },
    { name: 'Spectate', empty: 'No internet games responded to the query.', rows: SERVERS.slice(0, 2) },
    { name: 'Lan', empty: 'There are no servers running on your local network.', rows: [] },
    { name: 'Friends', empty: 'None of your friends are currently playing a game.', rows: [] },
    { name: 'Blacklisted Servers', empty: 'You currently have no servers blacklisted.', rows: [], blacklist: true },
  ];
  const BINDS = [
    ['MOVEMENT', [['Move forward', 'w'], ['Move back', 's'], ['Move left (strafe)', 'a'], ['Move right (strafe)', 'd'], ['Jump', 'SPACE'], ['Duck', 'SHIFT'], ['Swim up', ''], ['Swim down', '/'], ['Look up', ''], ['Look down', '']]],
    ['COMMUNICATION', [['Use voice communication', 'v'], ['Chat message', 'y'], ['Team message', 'u'], ['Voice Menu 1', 'z'], ['Voice Menu 2', 'x'], ['Voice Menu 3', 'c'], ['Call for help', 'e']]],
    ['TEAM FORTRESS', [['Change class', ','], ['Change team', '.'], ['Open Character Loadout', 'm'], ['Open Backpack', '']]],
  ];
  const CONSOLE = [
    ['out', '[TF Workshop] Got updated information for map [ workshop/pl_frostward.ugc577236574 ]'],
    ['out', '[TF Workshop] Got updated information for map [ workshop/jump_volcanic.ugc457004175 ]'],
    ['out', '[TF Workshop] Got updated information for map [ workshop/cp_dustbowl_jungle.ugc675613460 ]'],
    ['red', '[TF Workshop] Error fetching updated information for map id 511780908'],
    ['red', '[TF Workshop] Info lookup failed for workshop file 511780908 ( EResult 1 )'],
    ['out', '[TF Workshop] Got updated information for map [ workshop/cp_follower.ugc528096893 ]'],
    ['dev', 'Requesting texture value from var "$dummyvar" which is not a texture value (material: NULL material)'],
    ['out', '] status'],
    ['out', 'hostname: SYD Casual #2 | 2Fort Only'],
    ['out', 'version : 9612148/24 9612148 secure'],
    ['sel', 'map     : ctf_2fort at: 0 x, 0 y, 0 z'],
    ['out', 'players : 31 humans, 0 bots (32 max)'],
    ['red', '[SteamNetworkingSockets] SDR network config fetch attempt #1 failed.  HTTP 504.  .  Trying again.'],
  ];
  const COMPLETIONS = ['sv_cheats', 'sv_allow_point_servercommand', 'sv_pure', 'sv_lan'];
  const COMBOS = {
    // [menu text, value] items show the menu text in the list but the value once picked
    workshop: [['<All>', ''], 'Workshop maps', 'Subscribed'], tagsinc: ['include', 'do not include'], game: ['Team Fortress 2'],
    ping: [['<All>', ''], '< 50', '< 100', '< 150', '< 250', '< 350', '< 600'], location: [['<All>', ''], 'Australia', 'Asia', 'Europe', 'US - West', 'US - East'],
    secure: [['<All>', ''], 'Secure', 'Not secure'], speakers: ['Headphones', '2 Speakers (Stereo)', '4 Speakers', '5.1 Speakers'], quality: ['Low', 'Medium', 'High'],
    language: ['English'], captions: ['No captions', 'Subtitles (dialog only)', 'Closed Captions'],
    resolution: ['1280 x 720', '1600 x 900', '1920 x 1080', '2560 x 1440'], display: ['Full screen', 'Windowed', 'Windowed (no border)'],
    aspect: ['Normal 4:3', 'Widescreen 16:9', 'Widescreen 16:10'], vr: ['Disabled'], crosshair: ['Default', 'Cross', 'Circle', 'Dot'],
    spray: ['Mann Co. logo', 'Saxton Hale', 'Engineer\'s Pride'], download: ['Allow all custom files from server', 'Do not download any custom files', 'Do not download custom sounds', 'Only allow map files'],
  };

  // Text the game draws from its localization files: the stock English, mapped
  // to the token it comes from. A HUD's chat_english.txt can replace any of
  // these; everything else (server names, console lines) is sample content.
  const TOK = {
    "OPTIONS": "GameUI_Options",
    "Submit": "Console_Submit", "Console": "Console_Title", "Adjust brightness levels...": "GameUI_AdjustGamma",
    "Advanced...": "GameUI_AdvancedEllipsis", "Aspect Ratio": "GameUI_AspectRatio", "Widescreen 16:10": "GameUI_AspectWide16x10",
    "Widescreen 16:9": "GameUI_AspectWide16x9", "Audio": "GameUI_Audio", "Audio (spoken) language": "GAMEUI_AudioSpokenLanguage",
    "Boost microphone gain": "GameUI_BoostMicrophone", "Captioning": "GameUI_Captioning", "Clear Key": "GameUI_ClearKey",
    "Disabled": "GameUI_Disabled", "Display mode": "GameUI_DisplayMode", "Allow all custom files from server": "GameUI_DownloadFilter_ALL",
    "Only allow map files": "GameUI_DownloadFilter_MapsOnly", "Do not download any custom files": "GameUI_DownloadFilter_None",
    "Do not download custom sounds": "GameUI_DownloadFilter_NoSounds",
    "When a game server tries to download\\ncustom content to your computer": "GameUI_DownloadFilter_Title",
    "When a game server tries to download\ncustom content to your computer": "GameUI_DownloadFilter_Title",
    "Enable voice in this game": "GameUI_EnableVoice", "Full screen": "GameUI_Fullscreen", "High": "GameUI_High",
    "Import Spray...": "GameUI_ImportSprayEllipsis", "Enable the gamepad": "GameUI_JoystickLabel",
    "Vertical sensitivity": "GameUI_JoystickLookSpeedPitch", "Horizontal sensitivity": "GameUI_JoystickLookSpeedYaw",
    "Swap sticks on dual-stick controllers": "GameUI_JoystickSouthpaw", "Keyboard": "GameUI_Keyboard", "KEY/BUTTON": "GameUI_KeyButton",
    "Low": "GameUI_Low", "Medium": "GameUI_Medium", "Uses Miles Sound System. Copyright © 1991-2001 by RAD Game Tools, Inc.": "GameUI_Miles_Voice",
    "Mouse": "GameUI_Mouse", "Mouse acceleration": "GameUI_MouseAcceleration", "Mouse filter": "GameUI_MouseFilter", "Raw input": "GameUI_MouseRaw",
    "Mouse sensitivity": "GameUI_MouseSensitivity", "Multiplayer": "GameUI_Multiplayer", "Music volume": "GameUI_MusicVolume",
    "No captions": "GameUI_NoClosedCaptions", "Options": "GameUI_Options", "(Requires restart)": "GAMEUI_RequiresRestart",
    "Resolution": "GameUI_Resolution", "Reverse gamepad up-down axis": "GameUI_ReverseJoystick", "Reverse mouse": "GameUI_ReverseMouse",
    "Edit key": "GameUI_SetNewKey", "Silence the audio while the game window is in the background.": "GameUI_SndMuteLoseFocus",
    "Game volume": "GameUI_SoundEffectVolume", "Sound quality": "GameUI_SoundQuality", "Spraypaint image": "GameUI_SpraypaintImage",
    "Changes to your spraypaint image take effect when you join a server.": "GameUI_SpraypaintServerNote",
    "Subtitles (dialog only)": "GameUI_Subtitles", "Closed Captions": "GameUI_SubtitlesAndSoundEffects", "Test Microphone": "GameUI_TestMicrophone",
    "3rd party technology credits": "GameUI_ThirdPartyTechCredits", "Use Defaults": "GameUI_UseDefaults", "Video": "GameUI_Video",
    "Voice": "GameUI_Voice", "Voice receive volume *": "GameUI_VoiceReceiveVolume", "Voice transmit volume *": "GameUI_VoiceTransmitVolume",
    "Virtual Reality Mode": "GameUI_VRMode", "Windowed": "GameUI_Windowed", "Apply": "PropertyDialog_Apply", "Cancel": "PropertyDialog_Cancel",
    "OK": "PropertyDialog_OK", "Add common tags...": "ServerBrowser_AddCommonTags", "Add Current Server": "ServerBrowser_AddCurrentServer",
    "Add a Server": "ServerBrowser_AddServer", "Add server to blacklist": "ServerBrowser_AddServerToBlacklist",
    "Add server to favorites": "ServerBrowser_AddServerToFavorites", "<All>": "ServerBrowser_All", "Anti-cheat": "ServerBrowser_AntiCheat",
    "Asia": "ServerBrowser_Asia", "Australia": "ServerBrowser_Australia", "Blacklisted date": "ServerBrowser_BlacklistedDate",
    "Blacklisted Servers": "ServerBrowser_BlacklistTab", "Bots": "ServerBrowser_Bots", "Change filters": "ServerBrowser_ChangeFilters",
    "Connect": "ServerBrowser_Connect", "Connect to server": "ServerBrowser_ConnectToServer", "Europe": "ServerBrowser_Europe",
    "Favorites": "ServerBrowser_FavoritesTab", "has no password": "ServerBrowser_FilterDescNoPassword",
    "is not empty": "ServerBrowser_FilterDescNotEmpty", "is not full": "ServerBrowser_FilterDescNotFull",
    "supports replays": "ServerBrowser_FilterDescReplays", "Filters": "ServerBrowser_Filters", "Friends": "ServerBrowser_FriendsTab",
    "Game": "ServerBrowser_Game", "Has users playing": "ServerBrowser_HasUsersPlaying", "History": "ServerBrowser_HistoryTab",
    "Import Servers From File": "ServerBrowser_ImportBlacklist", "Internet": "ServerBrowser_InternetTab", "IP Address": "ServerBrowser_IPAddress",
    "Is not password protected": "ServerBrowser_IsNotPasswordProtected", "Lan": "ServerBrowser_LanTab", "Last played": "ServerBrowser_LastPlayed",
    "Latency": "ServerBrowser_Latency", "< 100": "ServerBrowser_LessThan100", "< 150": "ServerBrowser_LessThan150",
    "< 250": "ServerBrowser_LessThan250", "< 350": "ServerBrowser_LessThan350", "< 50": "ServerBrowser_LessThan50",
    "< 600": "ServerBrowser_LessThan600", "Location": "ServerBrowser_Location", "Map": "ServerBrowser_Map",
    "Max player count": "ServerBrowser_MaxPlayer", "You currently have no servers blacklisted.": "ServerBrowser_NoBlacklistedServers",
    "You currently have no favorite servers selected.": "ServerBrowser_NoFavoriteServers",
    "None of your friends are currently playing a game.": "ServerBrowser_NoFriendsServers",
    "No internet games responded to the query.": "ServerBrowser_NoInternetGamesResponded",
    "There are no servers running on your local network.": "ServerBrowser_NoLanServers",
    "No servers have been played recently.": "ServerBrowser_NoServersPlayed", "Not secure": "ServerBrowser_NotSecure",
    "Players": "ServerBrowser_Players", "Simplified list": "ServerBrowser_QuickListCheck", "Refresh all": "ServerBrowser_RefreshAll",
    "Quick refresh": "ServerBrowser_RefreshQuick", "Refresh server": "ServerBrowser_RefreshServer", "Secure": "ServerBrowser_Secure",
    "Server not full": "ServerBrowser_ServerNotFull", "Servers": "ServerBrowser_Servers", "Spectate": "ServerBrowser_SpectateTab",
    "Supports replays": "ServerBrowser_SupportsReplays", "Tags": "ServerBrowser_Tags", "do not include": "ServerBrowser_TagsDoNotInclude",
    "include": "ServerBrowser_TagsInclude", "US - East": "ServerBrowser_US_East", "US - West": "ServerBrowser_US_West",
    "View server info": "ServerBrowser_ViewServerInfo", "Workshop": "ServerBrowser_Workshop", "Subscribed": "ServerBrowser_WorkshopFilterSubscribed",
    "Workshop maps": "ServerBrowser_WorkshopFilterWorkshopOnly", "Call for help": "TF_Call_For_Help", "Open Character Loadout": "TF_Open_Charinfo",
    "Open Backpack": "TF_Open_Charinfo_Backpack", "TEAM FORTRESS": "TF_Title", "Voice Menu 1": "TF_voice_menu_A", "Voice Menu 2": "TF_voice_menu_B",
    "Voice Menu 3": "TF_voice_menu_C", "Blue": "Valve_Blue", "Change class": "Valve_Change_Class", "Change team": "Valve_Change_Team",
    "Chat message": "Valve_Chat_Message", "COMMUNICATION": "Valve_Communication_Title", "Duck": "Valve_Duck", "Green": "Valve_Green",
    "Jump": "Valve_Jump", "Look down": "Valve_Look_Down", "Look up": "Valve_Look_Up", "Move back": "Valve_Move_Back",
    "Move forward": "Valve_Move_Forward", "Move left (strafe)": "Valve_Move_Left", "Move right (strafe)": "Valve_Move_Right",
    "MOVEMENT": "Valve_Movement_Title", "Red": "Valve_Red", "Swim down": "Valve_Swim_Down", "Swim up": "Valve_Swim_Up",
    "Team message": "Valve_Team_Message", "Use voice communication": "Valve_Use_Voice_Communication",
  };
  const STOCK_FMT = { ServerBrowser_ServersCountWithBlacklist: 'Servers (%s1) (%s2 blacklisted)', ServerBrowser_ServersCount: 'Servers (%s1)', ServerBrowser_BlacklistedServersCount: 'Blacklisted Servers (%s1)' };
  // Which tokens a HUD's chat_english.txt actually changes in-game. Tested in TF2:
  // GameUI_*, PropertyDialog_*, Valve_* and TF_* work; ServerBrowser_* and
  // Console_* don't, so the server browser and console keep the game's text.
  const FIXED_TOKENS = /^(ServerBrowser_|Console_)/i;
  const tokStatus = tok => FIXED_TOKENS.test(tok) ? 'fixed' : 'ok';
  // Label text as vgui draws it: \n is a line break and "&" marks a hotkey letter
  const cleanText = v => String(v).replace(/\\n/g, '\n').replace(/&(?=[^&\s])/g, '');

  // ---------- Preview object ----------
  function Preview(rootEl, hooks) {
    this.el = rootEl;
    this.hooks = hooks || {};
    this.state = {
      view: 'browser', focused: true, sbTab: 0, sbRow: -1, sbFilters: false, ctx: null,
      optTab: 0, optRow: 'Move forward', open: null,
      checks: { quick: false, notfull: false, users: true, nopw: false, replay: false, reverse: false, filter: false, raw: true, accel: false, joy: false, joyrev: false, joyswap: false, mute: true, voice: true, boost: false },
      sliders: { sens: 0.3, accel: 0.0, joyyaw: 0.3, joypitch: 0.25, sfx: 0.8, music: 0.4, mic: 0.6, recv: 0.7, scale: 0.4, red: 1, green: 0.85, blue: 0.2 },
      vals: { workshop: '', tagsinc: 'do not include', game: 'Team Fortress 2', ping: '', location: '', secure: '', speakers: 'Headphones', quality: 'High', language: 'English', captions: 'No captions',
        resolution: '1920 x 1080', display: 'Full screen', aspect: 'Widescreen 16:9', vr: 'Disabled', crosshair: 'Default', spray: 'Mann Co. logo', download: 'Allow all custom files from server' },
      consoleLines: CONSOLE.slice(), consoleInput: 'sv_',
      size: {}, // view -> [w, h] after the window was resized
    };
    this.yres = 1440; // screen height: picks "yres" font entries and the layout scale
    SC = this.yres / 1080;
    this.strings = null; // the HUD's chat_english.txt tokens
    this.style = document.createElement('style');
    this.stage = document.createElement('div');
    this.stage.className = 'pv-stage';
    rootEl.appendChild(this.style);
    rootEl.appendChild(this.stage);
    this.bind();
  }

  // The HUD's replacement for a stock string (from chat_english.txt), or the stock English
  Preview.prototype.setStrings = function (st) { this.strings = st || null; };
  Preview.prototype.hudString = function (tok) {
    if (!tok || tokStatus(tok) === 'fixed') return null; // the game ignores chat_english.txt for these
    const t = this.strings && this.strings.tokens ? this.strings.tokens[tok.toLowerCase()] : null;
    return t ? cleanText(t.value) : null;
  };
  Preview.prototype.L = function (text) {
    if (text == null || text === '') return text;
    const h = this.hudString(TOK[text]);
    return h != null ? h : text;
  };
  Preview.prototype.fmt = function (tok, ...args) {
    const t = this.hudString(tok) || STOCK_FMT[tok];
    return t.replace(/%s(\d)/g, (m, i) => args[+i - 1] != null ? args[+i - 1] : '');
  };
  // data-tok marks elements whose text comes from a string token, for the sidebar
  const tokAttr = text => TOK[text] ? ` data-tok="${TOK[text]}"` : '';

  // Fonts that depend on scheme settings
  Preview.prototype.fontFor = function (f) {
    if (f === '@title') return this.titleFont || 'Default';
    if (f === '@slfont') return this.slFont || 'Default';
    return f;
  };
  Preview.prototype.dynFonts = function (S) {
    const has = n => n && S.fonts.has(n.toLowerCase());
    const t = S.baseString('FrameTitleBar.Font');
    const sl = S.baseString('SectionedListPanel.Font');
    return { title: has(t) ? t : 'Default', sl: has(sl) ? sl : 'Default' };
  };
  Preview.prototype.setScreen = function (h) { this.yres = h || 1080; SC = this.yres / 1080; };
  Preview.prototype.tall = function (name) {
    const ft = this.scheme.font(this.fontFor(name), this.yres) || this.scheme.font('Default', this.yres);
    return ft ? Math.max(6, px(ft.tall)) : px(16);
  };
  Preview.prototype.num = function (key, dflt) {
    const v = this.scheme.baseString(key);
    return v != null && v !== '' && !isNaN(+v) ? +v : dflt;
  };

  // Layout depends on font sizes and a few numeric settings; re-render when they change
  Preview.prototype.layoutSig = function () {
    return [this.yres, this.titleFont, this.slFont, ...['@title', 'Default', 'DefaultVerySmall', '@slfont', 'ConsoleText', 'DefaultSmall'].map(f => this.tall(f)),
      this.num('ScrollBar.Wide', 17), this.num('Frame.ClientInsetX', 5), this.num('Frame.ClientInsetY', 5), this.num('Frame.TitleTextInsetX', 28), this.num('Menu.TextInset', 6)].join('|');
  };

  Preview.prototype.setScheme = function (scheme, opts) {
    this.scheme = scheme; this.opts = opts || this.opts || {};
    const d = this.dynFonts(scheme);
    this.titleFont = d.title; this.slFont = d.sl;
    this.style.textContent = this.css();
    const sig = this.layoutSig();
    const changed = sig !== this.sig;
    this.sig = sig;
    return changed;
  };

  Preview.prototype.setView = function (v) { this.state.view = v; this.state.open = null; this.state.ctx = null; this.render(); };

  // Color the game would use for a key, including the control's own fallback
  Preview.prototype.color = function (key, fallback) {
    const S = this.scheme;
    const e = S.base.get(key.toLowerCase());
    if (e && !e.block) { const r = S.resolve(e.value); if (r.ok) return r.rgba; }
    if (Array.isArray(fallback)) return fallback;
    if (typeof fallback === 'string') return this.color(fallback, this.keyFallback(fallback));
    return W;
  };
  Preview.prototype.keyFallback = function (key) {
    for (const c of Object.values(CONTROLS)) for (const k of c.keys) if (k[0] === key && k[2] !== undefined) return k[2];
    return W;
  };

  // ---------- CSS generation ----------
  Preview.prototype.fontCss = function (ft) {
    const F = root.Fonts;
    if (!ft) return 'font-family:Tahoma,sans-serif;font-size:13px;line-height:16px;';
    const ratio = F.ratioFor(ft.name), tall = px(ft.tall);
    const w = ft.weight <= 0 ? 400 : Math.max(100, Math.min(900, Math.round(ft.weight / 100) * 100));
    const sh = [];
    if (ft.outline) for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) sh.push(`${x}px ${y}px 0 #000`);
    if (ft.dropshadow) sh.push('1px 1px 0 #000');
    if (ft.blur) sh.push(`0 0 ${ft.blur}px currentColor`);
    return `font-family:${F.cssFamily(ft.name)};font-size:${(tall * ratio).toFixed(2)}px;line-height:${tall}px;` +
      `font-weight:${w};font-style:${ft.italic ? 'italic' : 'normal'};` +
      `text-decoration:${[ft.underline && 'underline', ft.strikeout && 'line-through'].filter(Boolean).join(' ') || 'none'};` +
      `text-shadow:${sh.join(',') || 'none'};` + (ft.antialias ? '' : '-webkit-font-smoothing:none;');
  };

  Preview.prototype.css = function () {
    const S = this.scheme;
    const col = k => this.color(k, this.keyFallback(k));
    const out = [];
    const fontNames = new Set(['Default', 'DefaultSmall', 'DefaultVerySmall', 'ConsoleText', this.titleFont, this.slFont]);
    for (const name of fontNames) out.push(`.pv-stage .${fcls(name)}{${this.fontCss(S.font(name, this.yres) || S.font('Default', this.yres))}}`);

    // TF2 blends translucent colors in linear light; browsers blend sRGB values.
    // Pre-blend every translucent paint over what it's drawn on, so the
    // browser only ever sees the final color.
    const F = col('Frame.BgColor'), Fo = col('Frame.OutOfFocusBgColor');
    const O = (k, under) => over(col(k), under);
    const css = (k, under) => rgbaCss(over(col(k), under));

    // borders: lines drawn over the window background
    for (const name of BORDERS) {
      const b = S.border(name);
      const cls = bcls(name);
      if (!b) { out.push(`.pv-stage .${cls}{}`); continue; }
      if (b.kind === 'image') {
        const url = this.hooks.imageFor ? this.hooks.imageFor(b.image) : null;
        if (url) {
          // draw_corner_* use the engine's classic 480-line proportional scale,
          // not the 1080 one: 4 draws 12px at 1440p (measured in-game)
          const sw = b.srcW || 0, sh = b.srcH || 0;
          const dw = Math.floor((b.drawW || sw) * this.yres / 480 + 1e-6), dh = Math.floor((b.drawH || sh) * this.yres / 480 + 1e-6);
          out.push(`.pv-stage .${cls}::after{content:"";position:absolute;inset:0;pointer-events:none;border-style:solid;` +
            `border-width:${dh}px ${dw}px;border-image:url(${url}) ${sh} ${sw} fill / ${dh}px ${dw}px stretch;}`);
        } else {
          out.push(`.pv-stage .${cls}::after{content:"";position:absolute;inset:0;pointer-events:none;outline:1px dashed rgba(255,0,255,.8);outline-offset:-1px}`);
        }
        continue;
      }
      const sh = [];
      const dir = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] };
      const max = Math.max(...Object.values(b.sides).map(l => l.length), 0);
      for (let i = 0; i < max; i++) for (const side of ['left', 'top', 'right', 'bottom']) {
        const ln = b.sides[side][i];
        if (!ln || ln.rgba[3] === 0) continue;
        const [dx, dy] = dir[side];
        sh.push(`inset ${dx * (i + 1)}px ${dy * (i + 1)}px 0 0 ${rgbaCss(over(ln.rgba, F))}`);
      }
      out.push(`.pv-stage .${cls}{box-shadow:${sh.join(',') || 'none'};${b.backgroundtype === 2 ? 'border-radius:7px;' : ''}}`);
    }

    const inset = this.num('Menu.TextInset', 6);
    // the frame itself sits on whatever is behind the game UI; leave its own alpha
    out.push(`.pv-stage .vg-frame{background:${rgbaCss(F)};}`, `.pv-stage .vg-frame.out{background:${rgbaCss(Fo)};}`);
    // everything inside the frame, once for the focused and once for the unfocused background
    const rules = (pre, G, focused) => {
      const t = (sel, body) => out.push(sel.split(',').map(x => `.pv-stage ${pre}${x.trim()}`).join(',') + `{${body}}`);
      const bg = (k, under) => { const c = O(k, under); return { c, css: rgbaCss(c) }; };
      // title bar and close button
      const tb = bg(focused ? 'FrameTitleBar.BgColor' : 'FrameTitleBar.DisabledBgColor', G);
      t('.vg-title', `color:${css(focused ? 'FrameTitleBar.TextColor' : 'FrameTitleBar.DisabledTextColor', tb.c)};background:${tb.css};`);
      const cb = bg(focused ? 'FrameTitleButton.BgColor' : 'FrameTitleButton.DisabledBgColor', G);
      t('.vg-tbtn', `color:${css(focused ? 'FrameTitleButton.FgColor' : 'FrameTitleButton.DisabledFgColor', cb.c)};background:${cb.css};`);
      t('.vg-grip i:nth-child(odd)', `background:${css('FrameGrip.Color1', G)};`);
      t('.vg-grip i:nth-child(even)', `background:${css('FrameGrip.Color2', G)};`);
      // tabs: no hover state; pressed = selected
      const tab = bg('Button.BgColor', G), tabP = bg('Button.SelectedBgColor', G);
      t('.vg-tab', `color:${css('PropertySheet.TextColor', tab.c)};background:${tab.css};`);
      t('.vg-tab.on', `color:${css('PropertySheet.SelectedTextColor', tab.c)};`);
      t('.vg-tab:active', `background:${tabP.css};color:${css('PropertySheet.TextColor', tabP.c)};`);
      t('.vg-tab.on:active', `color:${css('PropertySheet.SelectedTextColor', tabP.c)};`);
      // buttons, over the window or (column headers) over the list
      const buttons = (sel, U) => {
        const n = bg('Button.BgColor', U), h = bg('Button.ArmedBgColor', U), d = bg('Button.DepressedBgColor', U);
        const s = sel.split(',');
        const S_ = suf => s.map(x => x + suf).join(',');
        t(S_(''), `color:${css('Button.TextColor', n.c)};background:${n.css};`);
        t(S_(':hover'), `color:${css('Button.ArmedTextColor', h.c)};background:${h.css};`);
        t(S_(':active') + ',' + S_('.down') + ',' + S_('.down:hover'), `color:${css('Button.DepressedTextColor', d.c)};background:${d.css};`);
        t(S_('.toggle.down') + ',' + S_('.toggle.down:hover'), `color:${css('ToggleButton.SelectedTextColor', d.c)};`);
        t(S_('.dis') + ',' + S_('.dis:hover') + ',' + S_('.dis:active'), `color:${css('Label.DisabledFgColor1', n.c)};background:${n.css};text-shadow:1px 1px 0 ${css('Label.DisabledFgColor2', n.c)};`);
      };
      buttons('.vg-btn', G);
      t('.vg-url', `color:${css('Button.TextColor', G)};`);
      t('.vg-url:hover', `color:${css('Button.ArmedTextColor', G)};`);
      // labels
      const lb = bg('Label.BgColor', G);
      t('.vg-label', `color:${css('Label.TextColor', lb.c)};background:${lb.css};`);
      t('.vg-label.dull', `color:${css('Label.TextDullColor', lb.c)};`);
      t('.vg-label.dis', `color:${css('Label.DisabledFgColor1', lb.c)};text-shadow:1px 1px 0 ${css('Label.DisabledFgColor2', lb.c)};`);
      // list panel
      const list = bg('ListPanel.BgColor', G);
      const sel = bg(focused ? 'ListPanel.SelectedBgColor' : 'ListPanel.SelectedOutOfFocusBgColor', list.c);
      t('.vg-list', `background:${list.css};`);
      t('.vg-list .empty', `color:${css('ListPanel.EmptyListInfoTextColor', list.c)};`);
      t('.vg-row', `color:${css('ListPanel.TextColor', list.c)};`);
      t('.vg-row.sel', `color:${css('ListPanel.SelectedTextColor', sel.c)};background:${sel.css};`);
      buttons('.vg-lhead .vg-btn', list.c);
      // sectioned list
      const sl = bg('SectionedListPanel.BgColor', G);
      const sh = bg('SectionedListPanelHeader.BgColor', sl.c);
      const ssel = bg(focused ? 'SectionedListPanel.SelectedBgColor' : 'SectionedListPanel.OutOfFocusSelectedBgColor', sl.c);
      const sselT = focused ? 'SectionedListPanel.SelectedTextColor' : 'SectionedListPanel.OutOfFocusSelectedTextColor';
      t('.vg-slist', `background:${sl.css};`);
      t('.vg-shead', `color:${css('SectionedListPanel.HeaderTextColor', sh.c)};background:${sh.css};`);
      t('.vg-shead::after', `background:${css('SectionedListPanel.DividerColor', sh.c)};`);
      t('.vg-srow', `color:${css('SectionedListPanel.TextColor', sl.c)};`);
      t('.vg-srow .k', `color:${css('SectionedListPanel.BrightTextColor', sl.c)};`);
      t('.vg-srow.sel,.vg-srow.sel .k', `color:${css(sselT, ssel.c)};background:${ssel.css};`);
      // menus (a menu item paints the menu color again on top of the menu)
      const menu = bg('Menu.BgColor', G), mi = bg('Menu.BgColor', menu.c), mia = bg('Menu.ArmedBgColor', menu.c);
      t('.vg-menu', `background:${menu.css};`);
      t('.vg-mi', `color:${css('Menu.TextColor', mi.c)};background:${mi.css};padding:0 ${inset + 6}px 0 ${inset}px;`);
      t('.vg-mi:hover,.vg-mi.armed', `color:${css('Menu.ArmedTextColor', mia.c)};background:${mia.css};`);
      t('.vg-mdiv', `background:${css('Menu.SeparatorColor', menu.c)};`);
      // tooltip
      const tip = bg('Tooltip.BgColor', G);
      t('.vg-tip', `color:${css('Tooltip.TextColor', tip.c)};background:${tip.css};`);
      // scroll bars (inside lists and the console)
      const scroll = (selPre, U) => {
        const tr = bg('ScrollBarSlider.BgColor', U);
        const b = bg('ScrollBarButton.BgColor', tr.c), bh = bg('ScrollBarButton.ArmedBgColor', tr.c), bd = bg('ScrollBarButton.DepressedBgColor', tr.c);
        t(`${selPre} .vg-sb`, `background:${tr.css};`);
        t(`${selPre} .vg-sbb`, `color:${css('ScrollBarButton.FgColor', b.c)};background:${b.css};`);
        t(`${selPre} .vg-sbb:hover`, `color:${css('ScrollBarButton.ArmedFgColor', bh.c)};background:${bh.css};`);
        t(`${selPre} .vg-sbb:active`, `color:${css('ScrollBarButton.DepressedFgColor', bd.c)};background:${bd.css};`);
        t(`${selPre} .vg-thumb`, `background:${css('ScrollBarSlider.FgColor', tr.c)};`);
      };
      scroll('.vg-list', list.c); scroll('.vg-slist', sl.c);
      const rich = bg('RichText.BgColor', G);
      scroll('.vg-rich', rich.c);
      // check boxes
      const chH = bg('CheckButton.ArmedBgColor', G), chD = bg('CheckButton.DepressedBgColor', G);
      const box = bg('CheckButton.BgColor', G), boxD = bg('CheckButton.DisabledBgColor', G);
      t('.vg-check', `color:${css('CheckButton.TextColor', G)};`);
      t('.vg-check.on', `color:${css('CheckButton.SelectedTextColor', G)};`);
      t('.vg-check:hover', `color:${css('CheckButton.HighlightFgColor', chH.c)};background:${chH.css};`);
      t('.vg-check:active', `background:${chD.css};`);
      t('.vg-check .box', `background:${box.css};box-shadow:inset 1px 1px 0 ${css('CheckButton.Border1', box.c)},inset -1px -1px 0 ${css('CheckButton.Border2', box.c)};color:${css('CheckButton.Check', box.c)};`);
      t('.vg-check.dis,.vg-check.dis:hover,.vg-check.dis:active', `color:${css('Label.DisabledFgColor1', G)};text-shadow:1px 1px 0 ${css('Label.DisabledFgColor2', G)};background:transparent;`);
      t('.vg-check.dis .box', `background:${boxD.css};color:${css('CheckButton.DisabledFgColor', boxD.c)};`);
      // text entries and combo boxes
      const te = bg('TextEntry.BgColor', G), teD = bg('TextEntry.DisabledBgColor', G), teS = bg('TextEntry.SelectedBgColor', te.c);
      t('.vg-entry,.vg-combo', `background:${te.css};color:${css('TextEntry.TextColor', te.c)};caret-color:${css('TextEntry.CursorColor', te.c)};`);
      t('.vg-entry::selection', `background:${teS.css};color:${css('TextEntry.SelectedTextColor', teS.c)};`);
      t('.vg-entry:disabled,.vg-combo.dis', `background:${teD.css};color:${css('TextEntry.DisabledTextColor', teD.c)};`);
      const arr = bg('ComboBoxButton.BgColor', te.c), arrD = bg('ComboBoxButton.DisabledBgColor', teD.c);
      t('.vg-combo .arr', `color:${css('ComboBoxButton.ArrowColor', arr.c)};background:${arr.css};`);
      t('.vg-combo:not(.fixed):hover .arr,.vg-combo.open .arr', `color:${css('ComboBoxButton.ArmedArrowColor', arr.c)};`);
      t('.vg-combo.dis .arr', `background:${arrD.css};`);
      // sliders
      const track = bg('Slider.TrackColor', G);
      t('.vg-slider .track', `background:${track.css};`);
      t('.vg-slider .nob', `background:${css('Slider.NobColor', track.c)};`);
      t('.vg-slider .ticks i', `background:${css('Slider.TextColor', G)};`);
      t('.vg-slider .ends', `color:${css('Slider.TextColor', G)};`);
      t('.vg-slider.dis .ends', `color:${css('Slider.DisabledTextColor1', G)};text-shadow:1px 1px 0 ${css('Slider.DisabledTextColor2', G)};`);
      t('.vg-slider.dis .ticks i', `background:${css('Slider.DisabledTextColor1', G)};`);
      // console
      const rs = bg('RichText.SelectedBgColor', rich.c);
      t('.vg-rich', `background:${rich.css};color:${css('Console.TextColor', rich.c)};`);
      t('.vg-rich .dev', `color:${css('Console.DevTextColor', rich.c)};`);
      t('.vg-rich .red', `color:rgb(255,90,90);`);
      t('.vg-rich .sel,.vg-rich ::selection', `color:${css('RichText.SelectedTextColor', rs.c)};background:${rs.css};`);
    };
    rules('', F, true);
    rules('.vg-frame.out ', Fo, false);
    return out.join('\n');
  };

  // Porter-Duff "over" in linear light; colors are 0-255 sRGB with straight alpha
  const s2l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const l2s = l => { l = Math.max(0, Math.min(1, l)); return 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055); };
  function over(top, under) {
    const ta = top[3] / 255, ua = (under ? under[3] : 0) / 255;
    if (ta >= 1 || !under) return top.slice();
    const oa = ta + ua * (1 - ta);
    if (oa <= 0) return [0, 0, 0, 0];
    const ch = i => Math.round(l2s((s2l(top[i]) * ta + s2l(under[i]) * ua * (1 - ta)) / oa));
    return [ch(0), ch(1), ch(2), Math.round(oa * 255)];
  }
  Preview.over = over;

  // ---------- markup helpers ----------
  const U = (c, name, extra) => ` data-c="${c}" data-n="${esc(name)}"${extra || ''}`;
  const P = (x, y, w, h) => `left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;height:${px(h)}px;`;
  const align = a => a === 'east' ? 'justify-content:flex-end;' : a === 'center' ? 'justify-content:center;' : '';

  Preview.prototype.btn = function (x, y, w, h, label, o) {
    o = o || {};
    const b = o.down ? 'ButtonDepressedBorder' : o.dflt ? 'ButtonKeyFocusBorder' : 'ButtonBorder';
    const cls = ['vg-btn', 'ctl', 'ab', 'bd', bcls(b), fcls('Default'), o.dis && 'dis', o.down && 'down', o.toggle && 'toggle'].filter(Boolean).join(' ');
    const t = this.L(label);
    return `<div class="${cls}" style="${P(x, y, w, h)}${align(o.align)}" ${o.act ? `data-act="${o.act}"` : ''}${U(o.toggle ? 'toggle' : 'button', `"${t}" button`, tokAttr(label))}><span class="txt">${esc(t)}</span></div>`;
  };
  Preview.prototype.label = function (x, y, w, h, text, o) {
    o = o || {};
    const kind = o.dis ? 'dis' : o.dull ? 'dull' : '';
    const c = o.dis ? 'labeldis' : o.dull ? 'labeldull' : 'label';
    const f = o.font || 'Default';
    const wrap = o.wrap ? 'wrap' : '';
    const t = this.L(text);
    return `<div class="vg-label ctl ab ${kind} ${wrap} ${fcls(f)}" style="${P(x, y, w, h)}${align(o.align)}${o.north ? 'align-items:flex-start;' : ''}"${U(c, `"${String(t).split('\n')[0]}" label`, (f !== 'Default' ? ` data-f="${f}"` : '') + tokAttr(text))}><span class="txt">${esc(t).replace(/\n/g, '<br>')}</span></div>`;
  };
  Preview.prototype.check = function (x, y, w, h, id, text, o) {
    o = o || {};
    const on = !!this.state.checks[id], t = this.L(text);
    return `<div class="vg-check ctl ab ${fcls('Default')} ${on ? 'on' : ''} ${o.dis ? 'dis' : ''}" style="${P(x, y, w, h)}" data-act="check" data-id="${id}"${U('check', `"${t}" checkbox`, tokAttr(text))}>
      <span class="box">${on ? ICON.check : ''}</span><span class="txt">${esc(t)}</span></div>`;
  };
  Preview.prototype.entry = function (x, y, w, h, id, value, o) {
    o = o || {};
    const b = o.console ? 'DepressedButtonBorder' : 'ButtonDepressedBorder';
    return `<input class="vg-entry ab bd ${bcls(b)} ${fcls('Default')}" style="${P(x, y, w, h)}" id="pv-${id}" value="${esc(value)}" ${o.dis ? 'disabled' : ''} autocomplete="off" spellcheck="false"${U(o.console ? 'centry' : 'entry', o.name || 'Text box')}>`;
  };
  Preview.prototype.combo = function (x, y, w, h, id, o) {
    o = o || {};
    const s = this.state, val = s.vals[id] != null ? s.vals[id] : '';
    const open = s.open === id;
    const items = (COMBOS[id] || [val]).map(it => Array.isArray(it) ? { t: it[0], v: it[1] } : { t: it, v: it });
    const menu = open ? `<div class="vg-menu ab bd ${bcls('MenuBorder')}" style="left:${px(x)}px;top:${px(y + h)}px;min-width:${px(w)}px;z-index:20"${U('menu', 'Dropdown list')}>${items.map(it =>
      `<div class="vg-mi ctl ${fcls('Default')} ${it.v === val ? 'armed' : ''}" data-act="pick" data-id="${id}" data-v="${esc(it.v)}"${U('mitem', `Menu item "${this.L(it.t) || '(none)'}"`, tokAttr(it.t))}>${esc(this.L(it.t)) || '&nbsp;'}</div>`).join('')}</div>` : '';
    // what the closed box shows: the picked item's own text, or its value for "<All>"-style items
    const cur = items.find(it => it.v === val), shown = cur && cur.t === cur.v ? this.L(val) : val;
    // a fixed dropdown (o.fixed) can't be opened, like the server browser's Game filter
    return `<div class="vg-combo ctl ab bd ${bcls('ComboBoxBorder')} ${fcls('Default')} ${open ? 'open' : ''} ${o.dis ? 'dis' : ''} ${o.fixed ? 'fixed' : ''}" style="${P(x, y, w, h)}"${o.fixed ? '' : ` data-act="combo" data-id="${id}"`}${U('combo', o.name ? `"${o.name}" dropdown` : 'Dropdown')}>
      <span class="v">${esc(shown)}</span><span class="arr">${ICON.down}</span></div>${menu}`;
  };
  Preview.prototype.slider = function (x, y, w, h, id, o) {
    o = o || {};
    const v = this.state.sliders[id] != null ? this.state.sliders[id] : 0.5;
    const caps = h >= 34 && o.caps !== false;
    return `<div class="vg-slider ab ${o.dis ? 'dis' : ''}" style="${P(x, y, w, h)}" data-slider="${id}"${U('slider', o.name ? `"${o.name}" slider` : 'Slider')}>
      <div class="rail"><div class="track bd ${bcls('ButtonDepressedBorder')}"></div><div class="ticks">${'<i></i>'.repeat(11)}</div><div class="nob bd ${bcls('ButtonBorder')}" style="left:${(v * 100).toFixed(1)}%"></div></div>
      ${caps ? `<div class="ends ${fcls('DefaultVerySmall')}"><span>Low</span><span>High</span></div>` : ''}
    </div>`;
  };
  Preview.prototype.divider = function (x, y, w, h) {
    return `<div class="vg-div ab bd ${bcls('ButtonDepressedBorder')}" style="${P(x, y, w, h)}"${U('divider', 'Divider')}></div>`;
  };
  Preview.prototype.url = function (x, y, w, h, text) {
    const t = this.L(text);
    return `<div class="vg-url ctl ab ${fcls('Default')}" style="${P(x, y, w, h)}"${U('url', `"${t}" link`, tokAttr(text))}><span class="txt">${esc(t)}</span></div>`;
  };
  Preview.prototype.scrollbar = function (x, y, h, id, frac, pos) {
    const sw = this.num('ScrollBar.Wide', 17);
    return `<div class="vg-sb ab" style="${P(x, y, sw, h)}" data-sb="${id}"${U('sbslider', 'Scroll bar')}>
      <span class="vg-sbb ab bd ${bcls('ScrollBarButtonBorder')}" style="${P(0, 0, sw, sw)}" data-sbstep="-1"${U('sbbtn', 'Scroll up button')}>${ICON.up}</span>
      <span class="vg-sbtrack ab" style="left:0;right:0;top:${px(sw)}px;bottom:${px(sw)}px"><span class="vg-thumb ab bd ${bcls('ScrollBarSliderBorder')}" style="left:0;right:0;height:${(frac * 100).toFixed(1)}%;top:${(pos * (1 - frac) * 100).toFixed(1)}%"${U('sbslider', 'Scroll bar handle')}></span></span>
      <span class="vg-sbb ab bd ${bcls('ScrollBarButtonBorder')}" style="left:0;bottom:0;width:${px(sw)}px;height:${px(sw)}px" data-sbstep="1"${U('sbbtn', 'Scroll down button')}>${ICON.down}</span>
    </div>`;
  };

  // Frame: title, close button, grip; content positioned in frame coordinates.
  // Frame::GetClientArea: ClientInsetX is in pixels (never scaled); the client
  // top is the scaled ClientInsetY + title font height + scaled 7px border + scaled 1px.
  Preview.prototype.metrics = function () {
    const ix = this.num('Frame.ClientInsetX', 5), iy = this.num('Frame.ClientInsetY', 5);
    const tt = this.tall('@title');
    return { ix: ix / SC, iy, tt, cy: (px(iy) + tt + px(7) + px(1)) / SC, tx: this.num('Frame.TitleTextInsetX', 28) };
  };
  // Window size for a resizable view (layout units), from what the user dragged it to
  Preview.prototype.sizeFor = function (view, defW, defH, minW, minH) {
    const sz = this.state.size && this.state.size[view];
    const w = Math.max(minW, sz ? sz[0] : defW), h = Math.max(minH, sz ? sz[1] : defH);
    this.frameDims = { view, w, h, minW, minH };
    return [w, h];
  };
  Preview.prototype.frame = function (title, w, h, body) {
    const s = this.state, m = this.metrics();
    const rs = !!this.frameDims;
    const edges = rs ? `<div class="vg-rs e" data-rs="e"></div><div class="vg-rs s" data-rs="s"></div><div class="vg-rs se" data-rs="se"></div>` : '';
    const t = this.L(title);
    return `<div class="vg-frame bd ${bcls('FrameBorder')} ${s.focused ? '' : 'out'}" style="width:${px(w)}px;height:${px(h)}px;--s:${SC}"${rs ? ` data-vscode-context='{"tf2Resizable":true}'` : ''}${U('frame', `${t} window`)}>
      <div class="vg-title ctl ab ${fcls(this.titleFont)}" style="${P(m.tx, m.iy, w - m.tx - 40, (m.tt + 2) / SC)}"${U('title', `${t} window title`, tokAttr(title))}><span class="txt">${esc(t)}</span></div>
      <div class="vg-tbtn ab bd ${bcls('TitleButtonBorder')}" style="${P(w - 31, 8, 18, 18)}"${U('titlebtn', 'Close button')}>${ICON.close}</div>
      ${body}
      <div class="vg-grip ab" style="right:3px;bottom:3px"${rs ? ' data-rs="se"' : ''}${U('grip', 'Resize grip')}>${'<i></i>'.repeat(6)}</div>
      ${edges}
    </div>`;
  };
  // PropertySheet::PerformLayout. The tab row is "tabheight" 28 (scaled); a tab is
  // that less 1 when active and 3 otherwise, 2px / 4px down from the top (pixels,
  // not scaled), 1px apart. With "tabxfittotext" (on by default) a tab is
  // Button::SizeToContents, i.e. text + text inset + scaled 8, plus the text inset
  // on each side; the Button text inset is scaled 6 and the text is west-aligned.
  const tabRow = () => px(28) / SC;
  Preview.prototype.sheet = function (x, y, w, h, names, on, act) {
    const row = px(28), ins = px(6);
    const tabs = names.map((n, i) => {
      const active = i === on;
      const b = active ? 'TabActiveBorder' : 'TabBorder';
      return `<span class="vg-tab ctl bd ${bcls(b)} ${fcls('Default')} ${active ? 'on' : ''}" style="margin-top:${active ? 2 : 4}px;height:${row - (active ? 1 : 3)}px;padding:0 ${ins * 2 + px(8)}px 0 ${ins}px" data-act="${act}" data-i="${i}"${U('tab', `"${this.L(n)}" tab`, tokAttr(n))}><span class="txt">${esc(this.L(n))}</span></span>`;
    }).join('');
    return `<div class="vg-tabs ab" style="${P(x, y, w, tabRow())}gap:1px">${tabs}</div>
      <div class="vg-page ab bd ${bcls('PropertySheetBorder')}" style="${P(x, y + tabRow(), w, h - tabRow())}"${U('sheet', 'Tab page')}></div>`;
  };

  // ---------- server browser ----------
  const SB_COLS = [['', 16, 'lock'], ['', 16, 'vac'], ['', 16, 'replay'], ['Servers', 0], ['Game', 112], ['Players', 54], ['Bots', 38], ['Map', 92], ['Latency', 50], ['Tags', 44]];
  Preview.prototype.serverList = function (x, y, w, h, tab) {
    const s = this.state, rh = this.tall('DefaultSmall') + 2, sw = this.num('ScrollBar.Wide', 17);
    // ListPanel::PerformLayout: column headers are as tall as the scroll bar is wide;
    // the scroll bar runs from the top, 2px in from the right edge and 2px short of the bottom
    const hh = sw, inner = w - sw - 2 / SC;
    const sbFont = fcls('DefaultSmall'); // the list's rows and column headers
    let cols = SB_COLS.slice();
    if (tab.history) cols[cols.length - 1] = ['Last played', 70];
    if (tab.blacklist) cols = [['Blacklisted Servers (0)', 0], ['IP Address', 160], ['Blacklisted date', 160]];
    const fixed = cols.reduce((a, c) => a + c[1], 0), flex = Math.max(60, inner - fixed);
    const widths = cols.map(c => c[1] || flex);
    const rows = tab.rows;
    const first = tab.blacklist ? this.fmt('ServerBrowser_BlacklistedServersCount', 0) : rows === SERVERS ? this.fmt('ServerBrowser_ServersCountWithBlacklist', rows.length, 0) : this.fmt('ServerBrowser_ServersCount', rows.length);
    const firstTok = tab.blacklist ? 'ServerBrowser_BlacklistedServersCount' : rows === SERVERS ? 'ServerBrowser_ServersCountWithBlacklist' : 'ServerBrowser_ServersCount';
    let cx = 0;
    const head = cols.map((c, i) => {
      const isFirst = tab.blacklist ? i === 0 : i === 3;
      const name = isFirst ? first : this.L(c[0]);
      const html = `<span class="vg-btn ctl ab bd ${bcls('ButtonBorder')} ${sbFont} col" style="${P(cx, 0, widths[i], hh)}"${U('colhead', `"${isFirst ? this.L('Servers') : name || c[2]}" column header`, isFirst ? ` data-tok="${firstTok}"` : tokAttr(c[0]))}>${c[2] ? ICON[c[2]] : `<span class="txt">${esc(name)}</span>`}</span>`;
      cx += widths[i];
      return html;
    }).join('');
    const body = rows.length ? rows.map((r, i) => {
      const cells = tab.blacklist ? [r[2], '103.214.110.6:27015', ''] : [r[0] ? ICON.lock : '', r[1] ? ICON.vac : '', '', r[2], r[3], r[4], r[5], r[6], r[7], tab.history ? 'Today' : r[8]];
      return `<div class="vg-row ${sbFont} ${i === s.sbRow ? 'sel' : ''}" style="height:${rh}px" data-act="sbrow" data-i="${i}"${U('row', i === s.sbRow ? 'Selected server row' : 'Server row')}>
        ${cells.map((c, j) => `<span style="width:${px(widths[j])}px">${j < 3 && !tab.blacklist ? c : esc(c)}</span>`).join('')}</div>`;
    }).join('') : `<div class="empty ${fcls('Default')}"${tokAttr(tab.empty)}>${esc(this.L(tab.empty))}</div>`;
    return `<div class="vg-list ab bd ${bcls('ButtonDepressedBorder')}" style="${P(x, y, w, h)}"${U('list', 'Server list')}>
      <div class="ab vg-lhead" style="${P(0, 0, inner, hh)}">${head}</div>
      <div class="ab vg-lbody" style="left:0;top:${px(hh) + 1}px;width:${px(inner)}px;bottom:0" data-scroll="sb1">${body}</div>
      ${this.scrollbar(inner, 0, h - 2 / SC, 'sb1', 1, 0)}
    </div>`;
  };

  // The stock layout is 640 x 384. When the window is resized the list grows with
  // it; the filters and the bottom row stay at the bottom, and the buttons on the
  // right (and the tags box's right edge) stay at the right.
  Preview.prototype.viewBrowser = function () {
    const s = this.state, m = this.metrics();
    const sx = 8, sy = Math.max(44, m.cy + 4), DW = 640, DH = sy + 340;
    const [W_, H] = this.sizeFor('browser', DW, DH, DW, DH);
    const dW = W_ - DW, dH = H - DH;
    const tab = SB_TABS[s.sbTab] || SB_TABS[0];
    const ox = sx, oy = sy + tabRow(); // page origin
    const at = (x, y) => [ox + x, oy + y];
    const out = [this.sheet(sx, sy, 624 + dW, 306 + dH, SB_TABS.map(t => t.name), s.sbTab, 'sbtab')];
    const B = (x, y, w, h, label, o) => { const [X, Y] = at(x, y); return this.btn(X, Y, w, h, label, o); };
    const L = (x, y, w, h, text, o) => { const [X, Y] = at(x, y); return this.label(X, Y, w, h, text, o); };
    const K = (x, y, w, h, id, text, o) => { const [X, Y] = at(x, y); return this.check(X, Y, w, h, id, text, o); };
    const CB = (x, y, w, h, id, o) => { const [X, Y] = at(x, y); return this.combo(X, Y, w, h, id, o); };
    const E = (x, y, w, h, id, v, o) => { const [X, Y] = at(x, y); return this.entry(X, Y, w, h, id, v, o); };
    const D = (x, y, w, h) => { const [X, Y] = at(x, y); return this.divider(X, Y, w, h); };
    const filters = s.sbFilters && !tab.blacklist;
    const desc = ['Team Fortress 2', s.vals.location && this.L(s.vals.location), ...[s.checks.notfull && 'is not full', s.checks.users && 'is not empty', s.checks.nopw && 'has no password', s.checks.replay && 'supports replays'].filter(Boolean).map(t => this.L(t))].filter(Boolean).join('; ') + ';';
    const connectDis = s.sbRow < 0 || !tab.rows.length;
    const by = 244 + dH; // bottom row
    if (tab.blacklist) {
      const [X, Y] = at(0, 8);
      out.push(this.serverList(X, Y, 624 + dW, 226 + dH, tab));
      out.push(B(160 + dW, by, 202, 24, 'Import Servers From File'), B(370 + dW, by, 144, 24, 'Add Current Server', { dis: true }), B(520 + dW, by, 100, 24, 'Add a Server'));
    } else if (tab.tags) { // customgamespage(_filters).res
      const [X, Y] = at(0, 8);
      out.push(this.serverList(X, Y, 624 + dW, (filters ? 90 : 226) + dH, tab));
      if (filters) {
        const fy = 104 + dH;
        out.push(L(8, fy, 62, 24, 'Workshop'), CB(74, fy, 112, 24, 'workshop', { name: 'Workshop' }), D(192, fy, 2, 24),
          L(200, fy, 34, 24, 'Tags'), CB(236, fy, 112, 24, 'tagsinc', { name: 'Tags' }), E(352, fy, 106 + dW, 24, 'tags', ''), B(465 + dW, fy, 154, 24, 'Add common tags...'),
          D(8, 136 + dH, 611 + dW, 2));
        out.push(...this.filterRows(at, dH));
      }
      out.push(K(8, by, 120, 24, 'quick', 'Simplified list'),
        B(142, by, 108, 24, filters ? 'Filters' : 'Change filters', { act: 'filters', toggle: true, down: filters }),
        L(250, by, 108 + dW, 24, desc),
        B(360 + dW, by, 100, 24, 'Quick refresh', { dis: true }), B(462 + dW, by, 94, 24, 'Refresh all'), B(557 + dW, by, 65, 24, 'Connect', { dflt: true, dis: connectDis, act: 'connect' }));
    } else { // internetgamespage(_filters).res
      const [X, Y] = at(0, 8);
      out.push(this.serverList(X, Y, 624 + dW, (filters ? 134 : 226) + dH, tab));
      if (filters) out.push(...this.filterRows(at, dH));
      out.push(K(8, by, 120, 24, 'quick', 'Simplified list'),
        B(140, by, 108, 24, filters ? 'Filters' : 'Change filters', { act: 'filters', toggle: true, down: filters }),
        L(250, by, 90 + dW, 24, desc),
        tab.add ? B(349 + dW, by, 100, 24, 'Add a Server') : B(345 + dW, by, 105, 24, 'Quick refresh', { dis: true }),
        B(453 + dW, by, 95, 24, 'Refresh all'), B(550 + dW, by, 67, 24, 'Connect', { dflt: true, dis: connectDis, act: 'connect' }));
    }
    if (s.ctx) out.push(this.menu(['Connect to server', 'View server info', 'Refresh server', '-', 'Copy IP address to clipboard', 'Add server to favorites', 'Add server to blacklist'], s.ctx.x, s.ctx.y));
    return this.frame('Servers', W_, H, out.join(''));
  };
  Preview.prototype.filterRows = function (at, dy) {
    const E = (x, y, w, h, id, v) => { const [X, Y] = at(x, y + dy); return this.entry(X, Y, w, h, id, v); };
    const L = (x, y, w, h, t) => { const [X, Y] = at(x, y + dy); return this.label(X, Y, w, h, t, { align: 'east' }); };
    const CB = (x, y, w, h, id, n, o) => { const [X, Y] = at(x, y + dy); return this.combo(X, Y, w, h, id, Object.assign({ name: n }, o)); };
    const K = (x, y, w, h, id, t) => { const [X, Y] = at(x, y + dy); return this.check(X, Y, w, h, id, t); };
    return [L(12, 150, 44, 24, 'Game'), CB(60, 150, 164, 24, 'game', 'Game', { fixed: true }), L(12, 180, 44, 24, 'Map'), E(60, 180, 164, 24, 'map', ''),
      L(12, 210, 144, 24, 'Max player count'), E(160, 210, 64, 24, 'maxp', ''),
      L(234, 150, 72, 24, 'Latency'), CB(311, 150, 112, 24, 'ping', 'Latency'), L(234, 180, 72, 24, 'Location'), CB(311, 180, 112, 24, 'location', 'Location'),
      L(236, 210, 72, 24, 'Anti-cheat'), CB(311, 210, 112, 24, 'secure', 'Anti-cheat'),
      K(436, 150, 184, 24, 'notfull', 'Server not full'), K(436, 170, 184, 24, 'users', 'Has users playing'),
      K(436, 190, 222, 24, 'nopw', 'Is not password protected'), K(436, 210, 222, 24, 'replay', 'Supports replays')];
  };
  Preview.prototype.menu = function (items, x, y, font) {
    font = font || 'Default';
    return `<div class="vg-menu ab bd ${bcls('MenuBorder')}" style="left:${x}px;top:${y}px;z-index:20"${U('menu', 'Menu')}>${items.map((it, i) =>
      it === '-' ? `<div class="vg-mdiv"${U('menu', 'Menu separator')}></div>` :
        `<div class="vg-mi ctl ${fcls(font)} ${i === 1 ? 'armed' : ''}" data-act="menu"${U('mitem', `Menu item "${this.L(it)}"`, tokAttr(it))}${font !== 'Default' ? ` data-f="${font}"` : ''}>${esc(this.L(it))}</div>`).join('')}</div>`;
  };

  // ---------- options ----------
  const OPT_TABS = ['Keyboard', 'Mouse', 'Audio', 'Video', 'Voice', 'Multiplayer'];
  Preview.prototype.viewOptions = function () {
    const s = this.state, m = this.metrics();
    // OptionsDialog is 512 x 406 (scaled). Frame::GetClientArea, then
    // PropertyDialog::PerformLayout, worked in pixels as the game does:
    // the sheet takes the client area less a scaled 32 at the bottom.
    const W_ = 512, H = 406, u = v => v / SC;
    const x = m.ix * SC, y = m.cy * SC, wide = px(W_) - 2 * x, tall = (px(H) - px(m.iy)) - y;
    const sx = u(x), sy = u(y), sw = u(wide), sheetH = u(tall - px(32));
    const ox = sx, oy = sy + tabRow(); // page origin
    const at = (x, y) => [ox + x, oy + y];
    const B = (x, y, w, h, label, o) => { const [X, Y] = at(x, y); return this.btn(X, Y, w, h, label, o); };
    const L = (x, y, w, h, text, o) => { const [X, Y] = at(x, y); return this.label(X, Y, w, h, text, o); };
    const K = (x, y, w, h, id, text, o) => { const [X, Y] = at(x, y); return this.check(X, Y, w, h, id, text, o); };
    const CB = (x, y, w, h, id, o) => { const [X, Y] = at(x, y); return this.combo(X, Y, w, h, id, o); };
    const E = (x, y, w, h, id, v, o) => { const [X, Y] = at(x, y); return this.entry(X, Y, w, h, id, v, o); };
    const SL = (x, y, w, h, id, o) => { const [X, Y] = at(x, y); return this.slider(X, Y, w, h, id, o); };
    const D = (x, y, w, h) => { const [X, Y] = at(x, y); return this.divider(X, Y, w, h); };
    const U_ = (x, y, w, h, t) => { const [X, Y] = at(x, y); return this.url(X, Y, w, h, t); };
    const out = [this.sheet(sx, sy, sw, sheetH, OPT_TABS, s.optTab, 'opttab')];
    switch (OPT_TABS[s.optTab]) {
      case 'Keyboard': { // optionssubkeyboard.res
        const [X, Y] = at(8, 10);
        out.push(this.keyList(X, Y, 480, 258));
        out.push(B(8, 276, 134, 24, 'Use Defaults'), B(148, 276, 111, 24, 'Advanced...'), B(272, 276, 106, 24, 'Edit key'), B(384, 276, 105, 24, 'Clear Key'));
        break;
      }
      case 'Mouse': // optionssubmouse.res
        out.push(K(28, 9, 150, 28, 'reverse', 'Reverse mouse'), K(200, 10, 150, 28, 'filter', 'Mouse filter'),
          L(35, 40, 148, 24, 'Mouse sensitivity'), SL(200, 40, 200, 40, 'sens', { name: 'Mouse sensitivity' }), E(400, 40, 50, 24, 'sens', '2.00'),
          K(30, 70, 150, 24, 'raw', 'Raw input'),
          K(30, 100, 150, 24, 'accel', 'Mouse acceleration'), SL(200, 100, 200, 40, 'accel', { name: 'Mouse acceleration', dis: !s.checks.accel }), E(400, 100, 50, 24, 'accelv', '1.00', { dis: !s.checks.accel }),
          D(35, 140, 396, 2),
          K(28, 148, 226, 28, 'joy', 'Enable the gamepad'),
          K(62, 176, 296, 28, 'joyrev', 'Reverse gamepad up-down axis', { dis: !s.checks.joy }), K(62, 202, 296, 28, 'joyswap', 'Swap sticks on dual-stick controllers', { dis: !s.checks.joy }),
          L(70, 235, 148, 24, 'Horizontal sensitivity', { dis: !s.checks.joy }), SL(232, 237, 186, 40, 'joyyaw', { name: 'Horizontal sensitivity', dis: !s.checks.joy }),
          L(70, 270, 148, 24, 'Vertical sensitivity', { dis: !s.checks.joy }), SL(232, 274, 186, 40, 'joypitch', { name: 'Vertical sensitivity', dis: !s.checks.joy }));
        break;
      case 'Audio': // optionssubaudio.res
        out.push(L(36, 19, 160, 24, 'Game volume'), SL(36, 43, 175, 50, 'sfx', { name: 'Game volume' }),
          L(254, 19, 160, 24, 'Music volume'), SL(254, 43, 175, 50, 'music', { name: 'Music volume' }),
          L(36, 92, 184, 24, 'Speaker configuration'), CB(36, 116, 175, 24, 'speakers', { name: 'Speaker configuration' }),
          L(254, 92, 179, 24, 'Sound quality'), CB(254, 116, 175, 24, 'quality', { name: 'Sound quality' }),
          L(36, 155, 175, 24, 'Audio (spoken) language'), CB(36, 179, 175, 24, 'language', { name: 'Audio (spoken) language' }), L(36, 199, 175, 24, '(Requires restart)'),
          L(254, 155, 175, 24, 'Captioning'), CB(254, 179, 175, 24, 'captions', { name: 'Captioning' }),
          K(33, 230, 430, 28, 'mute', 'Silence the audio while the game window is in the background.'),
          U_(254, 270, 200, 24, '3rd party technology credits'));
        break;
      case 'Video': // optionssubvideo.res
        out.push(L(36, 24, 160, 24, 'Resolution'), CB(36, 50, 160, 24, 'resolution', { name: 'Resolution' }),
          L(254, 24, 160, 24, 'Display mode'), CB(254, 50, 182, 24, 'display', { name: 'Display mode' }),
          L(36, 100, 160, 24, 'Aspect Ratio'), CB(36, 126, 160, 24, 'aspect', { name: 'Aspect Ratio' }),
          B(254, 126, 182, 24, 'Adjust brightness levels...', { dis: true }),
          L(36, 170, 160, 24, 'Virtual Reality Mode'), CB(36, 196, 160, 24, 'vr', { name: 'Virtual Reality Mode' }),
          B(254, 196, 182, 24, 'Advanced...'), U_(254, 270, 225, 24, '3rd party technology credits'));
        break;
      case 'Voice': // optionssubvoice.res
        out.push(K(33, 32, 216, 28, 'voice', 'Enable voice in this game'),
          L(42, 70, 180, 24, 'Voice transmit volume *'), SL(40, 94, 160, 26, 'mic', { name: 'Voice transmit volume' }),
          L(246, 70, 180, 24, 'Voice receive volume *'), SL(246, 94, 160, 42, 'recv', { name: 'Voice receive volume', caps: false }),
          B(40, 176, 160, 24, 'Test Microphone'), K(33, 212, 216, 28, 'boost', 'Boost microphone gain'),
          L(43, 250, 350, 48, 'Uses Miles Sound System. Copyright © 1991-2001 by RAD Game Tools, Inc.', { wrap: true }));
        break;
      case 'Multiplayer': { // tf optionssubmultiplayer.res
        const [ix, iy] = at(32, 158);
        out.push(L(32, 14, 181, 24, 'Crosshair appearance'), CB(106, 42, 124, 24, 'crosshair', { name: 'Crosshair' }),
          L(106, 76, 64, 24, 'Size', { font: 'DefaultSmall' }), SL(106, 94, 132, 24, 'scale', { name: 'Size' }),
          L(236, 37, 64, 24, 'Red', { font: 'DefaultSmall', align: 'east' }), SL(308, 38, 136, 24, 'red', { name: 'Red' }),
          L(236, 65, 64, 24, 'Green', { font: 'DefaultSmall', align: 'east' }), SL(308, 66, 136, 24, 'green', { name: 'Green' }),
          L(236, 92, 64, 24, 'Blue', { font: 'DefaultSmall', align: 'east' }), SL(308, 94, 136, 24, 'blue', { name: 'Blue' }),
          D(32, 128, 432, 2),
          L(32, 134, 150, 24, 'Spraypaint image'),
          `<div class="vg-img ab bd ${bcls('DepressedBorder')}" style="${P(ix, iy, 64, 64)}"${U('image', 'Spray image')}></div>`,
          CB(106, 158, 124, 24, 'spray', { name: 'Spraypaint image' }), B(106, 198, 124, 24, 'Import Spray...'),
          L(246, 157, 204, 64, 'Changes to your spraypaint image take effect when you join a server.', { font: 'DefaultSmall', wrap: true, north: true }),
          L(234, 212, 260, 36, 'When a game server tries to download\ncustom content to your computer', { wrap: true }),
          CB(240, 260, 250, 24, 'download', { name: 'Download filter' }),
          B(32, 260, 144, 24, 'Advanced...'));
        break;
      }
    }
    // OK / Cancel / Apply: scaled 72 x 24, scaled 80 apart, from the bottom right of the client area
    const by = u(tall + y - px(28)), bw = u(px(72)), bh = u(px(24));
    let bx = x + wide - px(80);
    const btns = [this.btn(u(bx), by, bw, bh, 'Apply', { dis: true })]; bx -= px(80);
    btns.push(this.btn(u(bx), by, bw, bh, 'Cancel')); bx -= px(80);
    btns.push(this.btn(u(bx), by, bw, bh, 'OK', { dflt: true }));
    out.push(...btns);
    return this.frame('OPTIONS', W_, H, out.join(''));
  };
  // SectionedListPanel::LayoutPanels. Sections and rows start 5px in (scaled, as in
  // TF2), and are as wide as the list less 10 and the scroll bar. A section header
  // is its font + 7 tall, with a 1px divider 2px from its bottom; rows are
  // "linespacing" 20 (scaled) tall and sections a scaled 8 apart. The keyboard
  // page's action column is 286 (scaled) wide and its text is indented 6px.
  // The scroll bar sits 2px in from the right edge.
  Preview.prototype.keyList = function (x, y, w, h) {
    const s = this.state, sbW = px(this.num('ScrollBar.Wide', 17));
    const W = px(w), H = px(h), ins = px(5), iw = Math.max(0, W - 10 - sbW);
    const ht = this.tall('DefaultVerySmall') + 7, rt = px(20), gap = px(8), col = px(286);
    const kb = this.L('KEY/BUTTON');
    const rows = BINDS.map(([sec, items], si) =>
      `<div class="vg-shead ctl ${fcls('DefaultVerySmall')}" style="height:${ht}px;${si ? `margin-top:${gap}px;` : ''}"${U('shead', `"${this.L(sec)}" section header`, tokAttr(sec))}><span style="width:${col}px">${esc(this.L(sec))}</span><span>${esc(kb)}</span></div>` +
      items.map(([a, k]) => `<div class="vg-srow ctl ${fcls(this.slFont)} ${a === s.optRow ? 'sel' : ''}" style="height:${rt}px" data-act="optrow" data-id="${esc(a)}"${U('srow', a === s.optRow ? 'Selected key row' : 'Key row', tokAttr(a))}><span style="width:${col}px">${esc(this.L(a))}</span><span class="k">${esc(k)}</span></div>`).join('')).join('');
    return `<div class="vg-slist ab bd ${bcls('ButtonDepressedBorder')}" style="${P(x, y, w, h)}"${U('slist', 'Key list')}>
      <div class="ab vg-lbody" style="left:${ins}px;top:0;width:${iw}px;bottom:0;padding-top:${ins}px" data-scroll="sb2">${rows}</div>${this.scrollbar((W - sbW - 2) / SC, 0, (H - 2) / SC, 'sb2', 0.45, 0)}</div>`;
  };

  // ---------- console (CConsolePanel::PerformLayout) ----------
  Preview.prototype.viewConsole = function () {
    const s = this.state, m = this.metrics();
    // 640 x 440 by default; CConsolePanel won't go below 100 x 100
    const [W_, H] = this.sizeFor('console', 640, 440, Math.ceil(100 + 2 * m.ix), Math.ceil(100 + m.cy + m.iy));
    // CConsoleDialog::PerformLayout puts the panel in the client area; all in pixels, as the game does
    const u = v => v / SC, X = m.ix * SC, Y = m.cy * SC, cwP = px(W_) - 2 * X, chP = (px(H) - px(m.iy)) - Y;
    const inset = px(8), entryH = px(24), top = px(4), entryInset = px(4), submitW = px(64), submitInset = px(7);
    const hx = u(X + inset), hy = u(Y + inset + top), hw = u(Math.max(0, cwP - inset * 2)), hh = u(Math.max(0, chP - (entryInset * 2 + inset * 2 + top + entryH)));
    const subXP = cwP - (inset + submitW + submitInset);
    const ey = u(Y + chP - (entryInset * 2 + entryH));
    const cx = u(X), subX = u(subXP), ew = u(Math.max(0, subXP - entryInset - inset * 2));
    const sw = this.num('ScrollBar.Wide', 17);
    const lines = s.consoleLines.map(([k, t]) => `<div class="${k}">${k === 'sel' ? '<span class="sel">' + esc(t) + '</span>' : esc(t)}</div>`).join('');
    const pre = (s.consoleInput || '').toLowerCase();
    const comps = pre ? COMPLETIONS.filter(c => c.startsWith(pre)) : [];
    const lineH = this.tall('DefaultSmall') + 4;
    const compMenu = comps.length ? `<div class="vg-menu ab bd ${bcls('MenuBorder')}" style="left:${px(hx)}px;top:${px(ey) - comps.length * lineH - 6}px;min-width:${px(260)}px;z-index:20"${U('menu', 'Autocomplete list')}>${comps.map((c, i) =>
      `<div class="vg-mi ctl ${fcls('DefaultSmall')} ${i === 0 ? 'armed' : ''}" data-act="comp" data-v="${esc(c)}"${U('mitem', 'Autocomplete item', ' data-f="DefaultSmall"')}>${esc(c)}</div>`).join('')}</div>` : '';
    const body = `<div class="vg-rich ab bd ${bcls('DepressedButtonBorder')} ${fcls('ConsoleText')}" style="${P(hx, hy, hw, hh)}"${U('console', 'Console output')}>
        <div class="ab vg-lbody" style="left:0;top:0;width:${Math.max(0, px(hw - sw))}px;bottom:0" data-scroll="sb3" data-bottom="1">${lines}</div>${this.scrollbar(hw - sw, 0, hh, 'sb3', 0.7, 1)}
      </div>
      ${this.entry(hx, ey, ew, u(entryH), 'con', s.consoleInput, { console: true, name: 'Console input' })}
      ${this.btn(cx + subX, ey, u(submitW), u(entryH), 'Submit', { act: 'submit', dflt: true })}
      ${compMenu}`;
    return this.frame('Console', W_, H, body);
  };

  Preview.prototype.render = function () {
    SC = (this.yres || 1080) / 1080;
    this.frameDims = null;
    const v = this.state.view;
    const html = v === 'options' ? this.viewOptions() : v === 'console' ? this.viewConsole() : this.viewBrowser();
    const active = document.activeElement && this.stage.contains(document.activeElement) ? document.activeElement.id : null;
    this.stage.innerHTML = `<div class="pv-scene pv-${v}">${html}</div>`;
    this.stage.querySelectorAll('[data-scroll]').forEach(b => { if (b.dataset.bottom) b.scrollTop = b.scrollHeight; this.syncThumb(b); });
    if (active) { const el = this.stage.querySelector('#' + active); if (el) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }
    if (this.hooks.rendered) this.hooks.rendered();
  };

  Preview.prototype.syncThumb = function (body) {
    const sb = this.stage.querySelector(`[data-sb="${body.dataset.scroll}"]`);
    if (!sb) return;
    const th = sb.querySelector('.vg-thumb');
    const frac = Math.min(1, body.clientHeight / Math.max(1, body.scrollHeight));
    const pos = body.scrollHeight > body.clientHeight ? body.scrollTop / (body.scrollHeight - body.clientHeight) : 0;
    th.style.height = (frac * 100).toFixed(1) + '%';
    th.style.top = (pos * (1 - frac) * 100).toFixed(1) + '%';
  };

  // ---------- interaction ----------
  Preview.prototype.bind = function () {
    const st = this.stage, s = this.state;
    st.addEventListener('click', e => {
      if (this.justResized) { this.justResized = false; return; }
      // every click also selects the element for the inspector, once the click has
      // been handled: if it re-rendered the dialog (selecting a row, say), pick the
      // new element under the pointer, not the one that was replaced
      const u = e.target.closest('[data-c]');
      this.onClick(e);
      if (!u || !this.hooks.pick) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const now = hit && st.contains(hit) ? hit.closest('[data-c]') : null;
      this.hooks.pick(now && now.dataset.c === u.dataset.c ? now : u, e.clientX, e.clientY);
    });
    st.addEventListener('dblclick', e => {
      // double-click a window edge or the grip to put the window back to its stock size
      if (!e.target.closest('[data-rs]') || !this.frameDims) return;
      delete s.size[this.frameDims.view];
      this.render();
      if (this.hooks.resized) this.hooks.resized(s.size);
    });
    st.addEventListener('contextmenu', e => {
      const row = e.target.closest('[data-act="sbrow"]');
      if (!row) return;
      e.preventDefault();
      const frame = row.closest('.vg-frame').getBoundingClientRect();
      const z = frame.width / row.closest('.vg-frame').offsetWidth || 1;
      s.sbRow = +row.dataset.i; s.open = null;
      s.ctx = { x: Math.round((e.clientX - frame.left) / z), y: Math.round((e.clientY - frame.top) / z) };
      this.render();
    });
    this.bindMore();
  };

  Preview.prototype.onClick = function (e) {
    const st = this.stage, s = this.state;
    const t = e.target.closest('[data-act],[data-sbstep]');
    if (t && t.dataset.sbstep) {
      const sb = t.closest('[data-sb]');
      const body = st.querySelector(`[data-scroll="${sb.dataset.sb}"]`);
      if (body) { body.scrollTop += +t.dataset.sbstep * 40; this.syncThumb(body); }
      return;
    }
    const a = t && t.dataset.act;
    const closeMenus = () => { const had = s.open || s.ctx; s.open = null; s.ctx = null; return had; };
    if (!a) { if (closeMenus()) this.render(); return; }
    if (t.classList.contains('dis')) return;
    if (a === 'sbtab') { s.sbTab = +t.dataset.i; s.sbRow = -1; closeMenus(); }
    else if (a === 'sbrow') { s.sbRow = +t.dataset.i; closeMenus(); }
    else if (a === 'filters') { s.sbFilters = !s.sbFilters; closeMenus(); }
    else if (a === 'opttab') { s.optTab = +t.dataset.i; closeMenus(); }
    else if (a === 'optrow') s.optRow = t.dataset.id;
    else if (a === 'check') { s.checks[t.dataset.id] = !s.checks[t.dataset.id]; }
    else if (a === 'combo') { s.open = s.open === t.dataset.id ? null : t.dataset.id; s.ctx = null; }
    else if (a === 'pick') { s.vals[t.dataset.id] = t.dataset.v; s.open = null; }
    else if (a === 'menu') closeMenus();
    else if (a === 'comp') { s.consoleInput = t.dataset.v + ' '; }
    else if (a === 'submit') { this.submitConsole(); return; }
    else return;
    e.preventDefault();
    this.render();
  };

  Preview.prototype.bindMore = function () {
    const st = this.stage, s = this.state;
    st.addEventListener('wheel', e => {
      if (e.ctrlKey) return; // zoom, handled by the webview
      const body = e.target.closest('[data-scroll]') || (e.target.closest('[data-sb]') && st.querySelector(`[data-scroll="${e.target.closest('[data-sb]').dataset.sb}"]`));
      if (!body) return;
      e.preventDefault(); body.scrollTop += e.deltaY; this.syncThumb(body);
    }, { passive: false });
    st.addEventListener('input', e => {
      if (e.target.id === 'pv-con') { s.consoleInput = e.target.value; this.render(); }
    });
    st.addEventListener('keydown', e => {
      if (e.target.id === 'pv-con') {
        if (e.key === 'Enter') { e.preventDefault(); this.submitConsole(); }
        if (e.key === 'Tab') { e.preventDefault(); const m = COMPLETIONS.find(c => c.startsWith(s.consoleInput.toLowerCase())); if (m) { s.consoleInput = m + ' '; this.render(); } }
      }
    });
    st.addEventListener('pointerdown', e => {
      const rs = e.button === 0 && e.target.closest('[data-rs]');
      if (rs && this.frameDims) { this.startResize(e, rs.dataset.rs); return; }
      const sl = e.target.closest('.vg-slider:not(.dis) .rail');
      if (!sl) return;
      const id = sl.closest('[data-slider]').dataset.slider;
      const move = ev => {
        const r = sl.getBoundingClientRect();
        s.sliders[id] = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        sl.querySelector('.nob').style.left = (s.sliders[id] * 100).toFixed(1) + '%';
      };
      move(e);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
  };

  // Drag the right edge, bottom edge or the grip to resize the server browser or console
  Preview.prototype.startResize = function (e, dir) {
    e.preventDefault();
    const fd = this.frameDims, s = this.state, view = fd.view;
    const frame = this.stage.querySelector('.vg-frame');
    // client pixels per CSS pixel (the webview's zoom), then CSS pixels per layout unit
    const z = (this.hooks.zoom && this.hooks.zoom()) || (frame.getBoundingClientRect().width / frame.offsetWidth) || 1;
    const x0 = e.clientX, y0 = e.clientY, w0 = fd.w, h0 = fd.h;
    let raf = 0, next = null, moved = false;
    this.resizing = true;
    document.body.classList.add('pv-resizing', 'rs-' + dir);
    const move = ev => {
      const w = /e/.test(dir) ? Math.max(fd.minW, Math.round(w0 + (ev.clientX - x0) / z / SC)) : w0;
      const h = /s/.test(dir) ? Math.max(fd.minH, Math.round(h0 + (ev.clientY - y0) / z / SC)) : h0;
      const cur = s.size[view] || [w0, h0];
      if (cur[0] === w && cur[1] === h) return;
      moved = true;
      next = [w, h];
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; s.size[view] = next; s.ctx = null; s.open = null; this.render(); });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (raf) { cancelAnimationFrame(raf); raf = 0; if (next) { s.size[view] = next; this.render(); } }
      this.resizing = false;
      this.justResized = moved;
      setTimeout(() => { this.justResized = false; }, 0);
      document.body.classList.remove('pv-resizing', 'rs-' + dir);
      if (moved && this.hooks.resized) this.hooks.resized(s.size);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  Preview.prototype.resetSize = function () {
    const v = this.state.view === 'console' ? 'console' : 'browser';
    delete this.state.size[v];
    if (this.state.view === v) this.render();
    return this.state.size;
  };

  Preview.prototype.submitConsole = function () {
    const s = this.state, cmd = (s.consoleInput || '').trim();
    if (!cmd) return;
    s.consoleLines.push(['out', '] ' + cmd]);
    if (cmd === 'clear') s.consoleLines = [];
    else if (/^echo\s/.test(cmd)) s.consoleLines.push(['out', cmd.slice(5)]);
    else if (!/^status\b/.test(cmd)) s.consoleLines.push(['out', `Unknown command "${cmd.split(/\s+/)[0]}"`]);
    s.consoleInput = '';
    this.render();
    const el = this.stage.querySelector('#pv-con'); if (el) el.focus();
  };

  // What an element is made of: [{kind:'color'|'value'|'font'|'border', key, role, fallback}]
  Preview.prototype.describe = function (el) {
    const c = CONTROLS[el.dataset.c];
    if (!c) return null;
    const items = [];
    for (const [key, role, fb] of c.keys) items.push({ kind: fb === undefined ? 'value' : 'color', key, role, fallback: fb });
    const fonts = el.dataset.f ? [el.dataset.f] : (c.fonts || []);
    for (const f of fonts) items.push({ kind: 'font', key: this.fontFor(f), role: f === 'Marlett' ? 'Icon font (Marlett glyphs)' : 'Font' });
    for (const [b, role] of c.borders || []) items.push({ kind: 'border', key: b, role });
    if (el.dataset.tok) items.push({ kind: 'string', key: el.dataset.tok, role: 'Text' });
    return { control: el.dataset.c, controlName: c.name, name: el.dataset.n || c.name, note: c.note, items };
  };

  // The game's English text for a token
  Preview.tokStatus = tokStatus;
  Preview.stockString = tok => { const lk = String(tok).toLowerCase(); const k = Object.keys(TOK).find(t => TOK[t].toLowerCase() === lk); return k != null ? k : STOCK_FMT[tok]; };
  root.Preview = Preview;
  Preview.CONTROLS = CONTROLS;
  Preview.BORDERS = BORDERS;
})(window);
