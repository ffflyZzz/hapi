# Quick Start

<Steps>

## Install HAPI

::: code-group

```bash [npm]
npm install -g @aiflyzx/hapi
```

```bash [npx (one-off)]
npx @aiflyzx/hapi
```

:::

Other install options: [Installation](./installation.md)

## Start the server

```bash
hapi server
```

On first run, HAPI prints an access token and saves it to `~/.hapi/settings.json`.

## Start a coding session

```bash
hapi
```

This starts Claude Code wrapped with HAPI. The session appears in the web UI.

## Open the UI

Open your browser:

```
http://<your-ip>:3006
```

Enter your access token to log in.

</Steps>

## Next steps

- [Seamless Handoff](./how-it-works.md#seamless-handoff) - Switch between terminal and phone seamlessly
- [Remote access](./installation.md#remote-access) - Access HAPI from anywhere
- [Notifications](./installation.md#telegram-setup) - Set up Telegram notifications
- [Install the App](./pwa.md) - Add HAPI to your home screen
