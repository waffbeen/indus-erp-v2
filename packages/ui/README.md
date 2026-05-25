# `@indus/ui` — Design System

Single source of truth for all design tokens in Indus ERP v2.

## Why this exists

The user requirement: **"make global things so we can change after time"**. Every visual decision — color, radius, font, shadow, spacing — lives in ONE place. Change here, whole app updates. No grep-and-replace through hundreds of files later.

## Active theme: `circle` (Variant 07)

Locked 2026-05-25 after reviewing 8 design variants. See [`tokens/circle.css`](./tokens/circle.css) for the full token list.

## Architecture

```
packages/ui/
├── tokens/
│   ├── circle.css       ← Active theme (Variant 07)
│   ├── starline.css     ← Alternate theme (Variant 08), inert by default
│   └── index.css        ← Entry point — controls which themes load
├── base.css             ← Typography reset + semantic utility classes
└── README.md            ← This file
```

## Usage

### In a CSS file (any app, any framework)

```css
@import "@indus/ui/base.css";   /* loads tokens + base utilities */

.my-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  color: var(--text);
}
```

### In JSX / TSX

Use the semantic utility classes (preferred) or inline `var(--token)`:

```tsx
<div className="card kpi kpi-peach">
  <p className="display text-2xl">₹12.4L</p>
  <p className="text-muted">Monthly spend</p>
</div>
```

```tsx
<button style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}>
  Approve
</button>
```

### **NEVER do this** (causes regressions)

```tsx
// ❌ Hex codes hardcoded outside packages/ui/tokens/
<div style={{ background: '#2F5C68' }} />

// ❌ Tailwind arbitrary value with hex
<div className="bg-[#2F5C68]" />
```

If you need a new color, **add a token to `tokens/circle.css`** (and `starline.css` for parity), then use the var.

## Token categories

| Group | Examples | Purpose |
|---|---|---|
| Brand | `--frame`, `--primary`, `--primary-hover` | App chrome + primary CTAs |
| Surfaces | `--bg`, `--surface`, `--surface-2` | Card backgrounds, page chrome |
| Text | `--text`, `--muted`, `--muted-2`, `--text-on-dark` | Foreground colors |
| Borders | `--border`, `--border-strong` | Dividers, outlines |
| Pastel tints | `--tint-teal`, `--tint-peach`, `--tint-sand`, `--tint-mint`, `--tint-lilac`, `--tint-blush` | KPI card backgrounds, badge fills |
| Status | `--success`, `--warning`, `--danger`, `--info` (each with `-bg` + `-fg` variants) | Semantic state colors |
| Typography | `--font-sans`, `--font-mono`, `--tracking-tight`, `--tracking-display` | Type scale and faces |
| Radii | `--radius-sm` → `--radius-2xl`, `--radius-pill` | Corner rounding scale |
| Shadows | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-dark` | Elevation |
| Motion | `--ease-out`, `--ease-spring`, `--dur-fast`, `--dur-normal`, `--dur-slow` | Animation timing |

## Swapping themes

### Option A — Compile-time (whole app changes)

Edit `tokens/index.css`:

```diff
- @import "./circle.css";
+ @import "./starline.css";
```

Rebuild. Done. Every component re-themes.

### Option B — Runtime per-user

Both `circle.css` and `starline.css` are loaded. Set a body attribute:

```html
<body data-theme="starline">
```

Switch on a user setting; no rebuild needed.

### Option C — Per-tenant (multi-brand SaaS)

Super admin assigns a theme to a tenant. On login, server sends user's `tenant.theme` in their session payload. Frontend sets `<body data-theme={...}>` on mount.

This is the architecture pre-baked for white-label / enterprise tier (see [pricing plan](../../docs/PRICING.md)).

## Adding a new theme

1. Copy `tokens/circle.css` to `tokens/<new-name>.css`.
2. Change the selector at top — `[data-theme="<new-name>"]` (don't include `:root` unless you want it to be the default).
3. Override only what's different from Circle (token cascade fills the rest).
4. Add `@import "./<new-name>.css";` to `index.css`.
5. Test by setting `<body data-theme="<new-name>">`.

## Adding a new token

If a component truly needs a color that isn't yet a token:

1. Add the token to **both** `circle.css` and `starline.css` (so theme swap doesn't break that component).
2. Pick a semantic name (`--tint-mango`, NOT `--orange-3`).
3. If you want a Tailwind utility for it, also update the Tailwind preset (will be added in `packages/ui/tailwind-preset.ts` when apps are scaffolded).

## Related

- [Project theme decisions](../../docs/THEME.md) (post-launch)
- [Variant 07 mockup](../../design-exploration/07-circle-illustrated.html) — visual reference
- [Variant 08 mockup](../../design-exploration/08-starline-pastel.html) — backup theme reference
