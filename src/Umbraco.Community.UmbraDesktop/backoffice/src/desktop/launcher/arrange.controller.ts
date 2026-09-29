import type { UmbraDesktopApp } from '../types';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import { filterApps } from './alphabet';
import { escapeClearsFilter } from './drawer.controller';
import { dropClassFor } from './drop-target';
import type { UmbraDesktopDragAccept, UmbraDesktopDropTarget } from './drop-target';
import type { UmbraDesktopDragSource } from './tile-drag.controller';
import type { UmbraDesktopGroupLabel } from './group-labels';
import {
  addApp,
  addGroup,
  createGroup,
  deleteGroup,
  moveApp,
  moveGroup,
  newGroupId,
  pinApp,
  removeApp,
  renameGroup,
  resetLayout,
} from './layout-edits';
import type {
  UmbraDesktopLauncherArrangement,
  UmbraDesktopLauncherInputs,
  UmbraDesktopLauncherView,
  UmbraDesktopLauncherViewGroup,
  UmbraDesktopPaletteGroup,
} from './resolve-launcher';
import { UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH, UMBRADESKTOP_LAUNCHER_SPLIT_MIN } from './geometry';
import { css, html, live, nothing, repeat, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Arrange mode (design §3.3): the banner, the layout with a button for every drag, Move to, and the
 * palette of what is not on the launcher.
 *
 * A controller rendering into the launcher's shadow root, like the drawer, so theme sheets reach it
 * and the one drag controller can hit-test it. Every edit goes through `layout-edits.ts` and is
 * handed to the launcher to store, one write per action. Move to and the rename field are inline.
 * Reset asks first, in a modal the taskbar opens on the launcher's behalf, since the launcher opens
 * no modal itself.
 */

/** What arrange mode asks of the launcher, which owns storage, the drag and the mode. */
export interface UmbraDesktopArrangeActions {
  /**
   * Store an edit's result; `undefined` is a no-op.
   * @param result The new arrangement.
   */
  commit(result: UmbraDesktopLauncherArrangement | undefined): void;
  /**
   * Start a drag from a tile, a palette row or a group handle.
   * @param e The press; its `currentTarget` is what the ghost copies.
   * @param source What is being dragged.
   */
  beginDrag(e: PointerEvent, source: UmbraDesktopDragSource): void;
  /** Leave arrange mode. */
  done(): void;
  /**
   * Put a question to the user in a modal, which the launcher asks the taskbar to open.
   * @param question The heading, what will happen, and the label of the button that says yes.
   * @returns The answer.
   */
  confirm(question: { headline: string; content: string; confirmLabel: string }): Promise<boolean>;
}

/** What arrange mode draws from, handed in on every render so handlers act on the latest. */
export interface UmbraDesktopArrangeState {
  /** What the catalogue says exists, which every edit needs to place apps and groups. */
  inputs: UmbraDesktopLauncherInputs;
  /** What the user has chosen so far, which every edit starts from. */
  arrangement: UmbraDesktopLauncherArrangement;
  /** The resolved launcher: Pinned, the groups (empty ones included) and the palette. */
  view: UmbraDesktopLauncherView;
  /** The drop target under the pointer during a drag. */
  over?: UmbraDesktopDropTarget;
  /** What is being dragged, which decides how a group card shows it is the target. */
  dragging?: UmbraDesktopDragAccept;
  /**
   * A group heading's text, translated or literal. The launcher's own, so both modes name a group
   * the same way.
   * @param label The label from the view.
   * @returns The text to show.
   */
  label(label: UmbraDesktopGroupLabel): string;
}

/**
 * The size of arrange mode's small buttons, in px: a tile's remove and ⋯, a group's handle, ⋯ and
 * delete, a palette row's +, and the height of Add all. The WCAG 2.5.8 minimum for a pointer target.
 */
const EDIT_BUTTON_PX = 24;

/**
 * How far a tile's remove and ⋯ buttons sit in from its corners, in px. Move to opens the same
 * distance below them, so its offset is derived from both rather than typed.
 */
const EDIT_INSET_PX = 2;

/**
 * The + glyph. Chrome, like the window controls, so inline rather than an icon font: Umbraco's
 * `icon-add` is drawn heavier than the ⋯ beside it at this size.
 */
const PLUS = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"></path></svg>`;

/** The ⋯ glyph. Umbraco's icon set has no "more" icon. */
const DOTS = html`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.5" fill="currentColor"></circle><circle cx="8" cy="8" r="1.5" fill="currentColor"></circle><circle cx="13" cy="8" r="1.5" fill="currentColor"></circle></svg>`;

/**
 * The key of an open menu: a tile's Move to, as `t|group|alias` since an app is drawn once per place,
 * or a group's own menu, as `g|group`.
 */
type UmbraDesktopMenuKey = string;

/**
 * The key of a tile's Move to.
 * @param groupId Its group, or the Pinned id.
 * @param alias The app.
 * @returns The key.
 */
const tileMenuKey = (groupId: string, alias: string): UmbraDesktopMenuKey => `t|${groupId}|${alias}`;

/**
 * The key of a group's menu.
 * @param groupId The group.
 * @returns The key.
 */
const groupMenuKey = (groupId: string): UmbraDesktopMenuKey => `g|${groupId}`;

/**
 * Arrange mode's rendering and local state. The launcher owns what is stored and the drag; this
 * owns only what lives for one visit to the mode: which half of a narrow panel shows, the palette
 * filter, the open menu and where focus goes next.
 */
export class UmbraDesktopArrangeController {
  /** The launcher, whose shadow root this renders into and whose localize it borrows. */
  #host: UmbLitElement;

  /** What arrange mode asks of the launcher. */
  #actions: UmbraDesktopArrangeActions;

  /** The state of the last render, which every handler acts on. */
  #state?: UmbraDesktopArrangeState;

  /** Whether the narrow layout is showing the palette instead of the layout (design D12). */
  #showPalette = false;

  /** The palette's filter text. */
  #paletteQuery = '';

  /** The menu that is open: a tile's Move to or a group's own. */
  #menuFor?: UmbraDesktopMenuKey;

  /**
   * A selector to focus once it exists. Kept until found, because an edit lands through the
   * settings context and the render that draws its result can come a frame later.
   */
  #focusNext?: string;

  /**
   * Wire the controller to the launcher it renders into and to what its edits ask of it.
   * @param host The launcher.
   * @param actions What arrange mode asks of it.
   */
  constructor(host: UmbLitElement, actions: UmbraDesktopArrangeActions) {
    this.#host = host;
    this.#actions = actions;
  }

  /** Start fresh each time arrange mode is entered, so no open menu or filter lingers. */
  reset(): void {
    this.#showPalette = false;
    this.#paletteQuery = '';
    this.#menuFor = undefined;
    this.#focusNext = undefined;
  }

  /**
   * Place an open Move to list, then put focus where the last action asked for it. Call from the
   * launcher's `updated()`. Placement comes first, because focusing an item scrolls it into view
   * and should scroll to where the list really is.
   */
  afterRender(): void {
    this.#placeMenu();
    if (!this.#focusNext) return;
    const element = this.#host.shadowRoot?.querySelector<HTMLElement>(this.#focusNext);
    if (!element) return;
    this.#focusNext = undefined;
    element.focus();
    if (element instanceof HTMLInputElement) element.select();
  }

  /**
   * Store any rename still being typed. The launcher calls this as it is unmounted: the taskbar
   * closes it on an outside press, before the field blurs and fires `change`, and a name typed and
   * then lost that way reads as the rename not working. Every pending rename goes into one write.
   */
  flush(): void {
    const state = this.#state;
    const root = this.#host.shadowRoot;
    if (!state || !root) return;
    let arrangement = state.arrangement;
    let pending = false;
    for (const input of root.querySelectorAll<HTMLInputElement>('.rename')) {
      const group = state.view.groups.find((g) => g.id === input.dataset.rename);
      if (!group || !this.#isRename(group, input.value)) continue;
      arrangement = renameGroup(state.inputs, arrangement, group.id, input.value);
      pending = true;
    }
    if (pending) this.#actions.commit(arrangement);
  }

  /**
   * Open Move to on whichever side of its tile has room inside the layout pane, which scrolls and
   * so clips anything that sticks out of it. Under the ⋯ button that opened it by default, its right
   * edge on the button's, which is where the eye already is: in the themes that make tiles rows the
   * button ends a row far wider than the list. When that would pass the pane's left edge, as it does
   * from a narrow tile in the first column, rightwards from the tile's left edge; and leftwards from
   * the tile's right edge when even that would pass the pane's right edge. Downwards by default;
   * upwards when it would pass the pane's bottom and there is room above. Measured after each render
   * rather than decided in CSS, because the room depends on where the tile and its button sit.
   */
  #placeMenu(): void {
    const menu = this.#host.shadowRoot?.querySelector<HTMLElement>('.movemenu');
    const pane = menu?.closest<HTMLElement>('.layout-pane');
    const tile = menu?.parentElement;
    if (!menu || !pane || !tile) return;
    menu.classList.remove('flip-x', 'flip-y');
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    // The pane's visible area: inside its border, and short of any scrollbar.
    const outer = pane.getBoundingClientRect();
    const left = outer.left + pane.clientLeft;
    const right = left + pane.clientWidth;
    const top = outer.top + pane.clientTop;
    const bottom = top + pane.clientHeight;
    const box = menu.getBoundingClientRect();
    const tileBox = tile.getBoundingClientRect();
    const button = tile.querySelector<HTMLElement>('.mv')?.getBoundingClientRect();
    if (button && button.right - box.width >= left && button.right <= right) {
      // The list is positioned against the tile's padding box, so the offset is measured from there.
      const paddingRight = tileBox.left + tile.clientLeft + tile.clientWidth;
      menu.style.left = 'auto';
      menu.style.right = `${paddingRight - button.right}px`;
    } else {
      const overRight = box.right - right;
      const overLeftIfFlipped = left - (tileBox.right - box.width);
      if (overRight > 0 && overLeftIfFlipped < overRight) menu.classList.add('flip-x');
    }
    if (box.bottom > bottom && tileBox.top - box.height >= top) menu.classList.add('flip-y');
  }

  /**
   * A term in the backoffice language.
   * @param key The term's key.
   * @returns The text.
   */
  #t(key: string): string {
    return this.#host.localize.term(key);
  }

  /**
   * A button's accessible name: a short term with the app or group it acts on in it. The longer
   * term beside each, which says what happens next, stays on the button's tooltip; joined to the
   * name, it made a screen reader read a sentence of advice before saying which tile it meant.
   * @param key The term's key, whose `%0%` takes the name.
   * @param name The app's or group's name, already translated.
   * @returns The text.
   */
  #named(key: string, name: string): string {
    return this.#host.localize.term(key, name);
  }

  /**
   * An app's translated name.
   * @param app The app.
   * @returns The name.
   */
  #name(app: UmbraDesktopApp): string {
    return this.#host.localize.string(app.name);
  }

  /**
   * Change local state and redraw. Local state is not reactive, so the host has to be told.
   * @param change The change.
   */
  #set(change: () => void): void {
    change();
    this.#host.requestUpdate();
  }

  /**
   * The whole of arrange mode.
   * @param state What to draw from.
   * @returns The template.
   */
  render(state: UmbraDesktopArrangeState) {
    this.#state = state;
    return html`
      <div class="arrange-mode" @pointerdown=${this.#closeMenuOutside} @focusout=${this.#closeMenuOnFocusOut}>
        ${this.#banner()}
        <div class="split ${this.#showPalette ? 'show-palette' : ''}">
          <div class="body layout-pane">
            ${this.#pinnedCard(state)}
            <div class="cards">
              ${repeat(state.view.groups, (g) => g.id, (g) => this.#groupCard(g))}
              <button class="card newgroup" @click=${this.#newGroup}>
                <umb-icon name="icon-add"></umb-icon>
                <span>${this.#t('umbraDesktop_arrangeNewGroup')}</span>
              </button>
            </div>
          </div>
          <div class="palette ${state.over?.kind === 'palette' ? 'drop' : ''}" data-drop="palette">${this.#palette(state)}</div>
        </div>
      </div>
    `;
  }

  /**
   * The banner in place of the header row.
   * @returns The banner template.
   */
  #banner() {
    return html`
      <div class="banner">
        <span class="banner-text">${this.#t('umbraDesktop_arrangeBanner')}</span>
        <button
          class="ctl add-apps"
          aria-pressed=${this.#showPalette ? 'true' : 'false'}
          @click=${() => this.#set(() => (this.#showPalette = !this.#showPalette))}>
          ${this.#t(this.#showPalette ? 'umbraDesktop_arrangeBackToLayout' : 'umbraDesktop_arrangeAddApps')}
        </button>
        <button class="ctl reset" @click=${this.#reset}>${this.#t('umbraDesktop_arrangeReset')}</button>
        <button class="ctl primary done" @click=${() => this.#actions.done()}>${this.#t('umbraDesktop_arrangeDone')}</button>
      </div>
    `;
  }

  /**
   * Reset, once the user has said yes in a modal (design D11). Pins stay (design D10). The modal
   * rather than a confirm in the banner's place: that swapped the banner's buttons for two others
   * in almost the same spot, and read as the Reset button having moved rather than as a question.
   * Asked of the latest state, and applied to the state as it is once answered.
   */
  #reset = async () => {
    const confirmed = await this.#actions.confirm({
      headline: this.#t('umbraDesktop_arrangeResetHeadline'),
      content: this.#t('umbraDesktop_arrangeResetConfirm'),
      confirmLabel: this.#t('umbraDesktop_arrangeReset'),
    });
    if (confirmed && this.#state) this.#actions.commit(resetLayout(this.#state.arrangement));
  };

  /**
   * Pinned, as a fixed place: a drop target with tiles, and no handle, rename or delete (design D5).
   * @param state What to draw from.
   * @returns The card.
   */
  #pinnedCard(state: UmbraDesktopArrangeState) {
    return html`
      <div
        class="card fav agroup ${dropClassFor(state.over, UMBRADESKTOP_PINNED_GROUP_ID)}"
        data-drop="group"
        data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
        <div class="gh">
          <umb-icon name="icon-pushpin"></umb-icon>
          <span class="gname">${this.#t('umbraDesktop_favourites')}</span>
          <span class="hint">${this.#t('umbraDesktop_arrangePinnedHint')}</span>
        </div>
        <div class="grid">
          ${repeat(state.view.pinned, (a) => a.alias, (a) => this.#tile(a, UMBRADESKTOP_PINNED_GROUP_ID, state.view.pinned))}
        </div>
      </div>
    `;
  }

  /**
   * One group, drawn even when empty so it can take a drop.
   * @param group The group.
   * @returns The card.
   */
  #groupCard(group: UmbraDesktopLauncherViewGroup) {
    const state = this.#state!;
    const name = state.label(group.label);
    const key = groupMenuKey(group.id);
    const open = this.#menuFor === key;
    // The gap the landing bar sits in the middle of, on the card a dragged group would land beside.
    const over = state.dragging === 'group' && state.over?.kind === 'group' && state.over.groupId === group.id ? state.over : undefined;
    return html`
      <div
        class="card agroup ${dropClassFor(state.over, group.id, undefined, state.dragging)}"
        style=${over ? `--launcher-drop-gap: ${over.gap}px` : nothing}
        data-drop="group"
        data-group=${group.id}>
        <div class="gh">
          <button
            class="handle"
            data-handle=${group.id}
            title=${this.#t('umbraDesktop_arrangeMoveGroup')}
            aria-label=${this.#named('umbraDesktop_arrangeMoveGroupNamed', name)}
            @pointerdown=${(e: PointerEvent) => this.#actions.beginDrag(e, { kind: 'group', groupId: group.id })}
            @keydown=${(e: KeyboardEvent) => this.#groupKey(e, group.id)}>
            <umb-icon name="icon-grip"></umb-icon>
          </button>
          <input
            class="rename"
            data-rename=${group.id}
            .value=${live(name)}
            aria-label=${this.#t('umbraDesktop_arrangeRename')}
            @change=${(e: Event) => this.#rename(group, e.target as HTMLInputElement)}
            @keydown=${(e: KeyboardEvent) => this.#renameKey(e, group, name)} />
          <button
            class="gdel"
            title=${this.#t('umbraDesktop_arrangeDeleteGroup')}
            aria-label=${this.#named('umbraDesktop_arrangeDeleteGroupNamed', name)}
            @click=${() => this.#deleteGroup(group.id)}>
            <umb-icon name="icon-trash"></umb-icon>
          </button>
          <button
            class="edit mv"
            data-menu=${key}
            title=${this.#t('umbraDesktop_arrangeGroupOptions')}
            aria-label=${this.#named('umbraDesktop_arrangeGroupOptionsNamed', name)}
            aria-haspopup="menu"
            aria-expanded=${open ? 'true' : 'false'}
            @click=${() => this.#toggleMenu(key)}>
            ${DOTS}
          </button>
          ${open ? this.#groupMenu(group, name) : ''}
        </div>
        <div class="grid">${repeat(group.apps, (a) => a.alias, (a) => this.#tile(a, group.id, group.apps))}</div>
      </div>
    `;
  }

  /**
   * One tile in arrange mode: it does not launch; it drags, and carries remove and ⋯.
   * @param app The app.
   * @param groupId Its group, or the Pinned id.
   * @param siblings The apps drawn beside it, for the arrow keys.
   * @returns The tile.
   */
  #tile(app: UmbraDesktopApp, groupId: string, siblings: ReadonlyArray<UmbraDesktopApp>) {
    const state = this.#state!;
    const name = this.#name(app);
    const key = tileMenuKey(groupId, app.alias);
    const open = this.#menuFor === key;
    return html`
      <div
        class="tile arr ${dropClassFor(state.over, groupId, app.alias)}"
        tabindex="0"
        role="group"
        aria-label=${name}
        data-drop="tile"
        data-group=${groupId}
        data-alias=${app.alias}
        @pointerdown=${(e: PointerEvent) => {
          if ((e.target as Element).closest('button, .movemenu')) return;
          this.#actions.beginDrag(e, { kind: 'app', app });
        }}
        @keydown=${(e: KeyboardEvent) => this.#tileKey(e, app, groupId, siblings)}>
        <umb-icon name=${app.icon}></umb-icon>
        <span class="tlb">${name}</span>
        <button
          class="edit rm"
          title=${this.#t('umbraDesktop_arrangeRemoveApp')}
          aria-label=${this.#named('umbraDesktop_arrangeRemoveAppNamed', name)}
          @click=${() => {
            this.#focusNext = this.#afterTileLeaves(app, groupId);
            this.#actions.commit(removeApp(state.inputs, state.arrangement, app));
          }}>
          <umb-icon name="icon-trash"></umb-icon>
        </button>
        <button
          class="edit mv"
          data-menu=${key}
          title=${this.#t('umbraDesktop_arrangeMoveTo')}
          aria-label=${this.#named('umbraDesktop_arrangeMoveToTitle', name)}
          aria-haspopup="menu"
          aria-expanded=${open ? 'true' : 'false'}
          @click=${() => this.#toggleMenu(key)}>
          ${DOTS}
        </button>
        ${open ? this.#menu(app, groupId) : ''}
      </div>
    `;
  }

  /**
   * Move to: Pinned, every other group, a new group, or off the launcher.
   * @param app The app.
   * @param groupId Where it is now.
   * @returns The list.
   */
  #menu(app: UmbraDesktopApp, groupId: string) {
    const state = this.#state!;
    const title = this.#host.localize.term('umbraDesktop_arrangeMoveToTitle', this.#name(app));
    return html`
      <div class="movemenu" role="menu" aria-label=${title} @keydown=${this.#menuKey}>
        <div class="mmh">${title}</div>
        ${groupId !== UMBRADESKTOP_PINNED_GROUP_ID
          ? html`<button
              class="mmi"
              role="menuitem"
              @click=${() => this.#fromMenu(pinApp(state.inputs, state.arrangement, app), this.#tileSelector(UMBRADESKTOP_PINNED_GROUP_ID, app))}>
              ${this.#t('umbraDesktop_favourites')}
            </button>`
          : ''}
        ${state.view.groups
          .filter((g) => g.id !== groupId)
          .map(
            (g) => html`<button
              class="mmi"
              role="menuitem"
              @click=${() => this.#fromMenu(moveApp(state.inputs, state.arrangement, app, g.id), this.#tileSelector(g.id, app))}>
              ${state.label(g.label)}
            </button>`,
          )}
        <button class="mmi new" role="menuitem" @click=${() => this.#moveToNewGroup(app)}>${this.#t('umbraDesktop_arrangeNewGroup')}</button>
        <button class="mmi rmv" role="menuitem" @click=${() => this.#fromMenu(removeApp(state.inputs, state.arrangement, app), this.#afterTileLeaves(app, groupId))}>
          ${this.#t('umbraDesktop_arrangeRemoveApp')}
        </button>
      </div>
    `;
  }

  /**
   * A group's own menu, the way to do without a drag what the handle does with one: move the group
   * to the start, one place earlier, one place later or to the end, offering only the moves that
   * would change something; and delete it, like the button beside it. For keyboard and touch users,
   * as Move to is for a tile: the arrow keys on the handle only help someone who knows they are
   * there.
   * @param group The group.
   * @param name Its name as shown.
   * @returns The list.
   */
  #groupMenu(group: UmbraDesktopLauncherViewGroup, name: string) {
    const state = this.#state!;
    const ids = state.view.groups.map((g) => g.id);
    const at = ids.indexOf(group.id);
    const title = this.#named('umbraDesktop_arrangeGroupOptionsNamed', name);
    const focus = `[data-menu="${CSS.escape(groupMenuKey(group.id))}"]`;
    const move = (before: string | undefined) => this.#fromMenu(moveGroup(state.inputs, state.arrangement, group.id, before), focus);
    const item = (kind: string, term: string, before: string | undefined) =>
      html`<button class="mmi ${kind}" role="menuitem" @click=${() => move(before)}>${this.#t(term)}</button>`;
    return html`
      <div class="movemenu" role="menu" aria-label=${title} @keydown=${this.#menuKey}>
        <div class="mmh">${title}</div>
        ${at > 1 ? item('first', 'umbraDesktop_arrangeMoveFirst', ids[0]) : ''}
        ${at > 0 ? item('earlier', 'umbraDesktop_arrangeMoveEarlier', ids[at - 1]) : ''}
        ${at < ids.length - 1 ? item('later', 'umbraDesktop_arrangeMoveLater', ids[at + 2]) : ''}
        ${at < ids.length - 2 ? item('last', 'umbraDesktop_arrangeMoveLast', undefined) : ''}
        <button
          class="mmi rmv"
          role="menuitem"
          @click=${() => {
            this.#menuFor = undefined;
            this.#deleteGroup(group.id);
          }}>
          ${this.#t('umbraDesktop_arrangeDeleteGroupItem')}
        </button>
      </div>
    `;
  }

  /**
   * Open or close a menu, focusing its first item when it opens.
   * @param key The tile's or the group's menu.
   */
  #toggleMenu(key: UmbraDesktopMenuKey): void {
    this.#set(() => {
      this.#menuFor = this.#menuFor === key ? undefined : key;
      if (this.#menuFor) this.#focusNext = '.movemenu .mmi';
    });
  }

  /**
   * Close Move to and store what was chosen, then focus what the choice leaves behind, because the
   * item that took the click leaves the DOM with the list and would otherwise drop keyboard focus
   * to the document.
   * @param result The edit's result.
   * @param focus A selector for what takes focus once the result has rendered.
   */
  #fromMenu(result: UmbraDesktopLauncherArrangement, focus: string): void {
    this.#menuFor = undefined;
    this.#focusNext = focus;
    this.#actions.commit(result);
    this.#host.requestUpdate();
  }

  /**
   * Where focus goes when a tile leaves its place, by remove or by Move to > Remove: the next tile, else
   * the previous one, else the group's name, which is the next thing a keyboard user would reach.
   * Pinned has no name field, so an emptied Pinned sends focus to Done.
   * @param app The app leaving.
   * @param groupId Where it was, or the Pinned id.
   * @returns A selector for what takes focus.
   */
  #afterTileLeaves(app: UmbraDesktopApp, groupId: string): string {
    const state = this.#state!;
    const pinned = groupId === UMBRADESKTOP_PINNED_GROUP_ID;
    const siblings = pinned ? state.view.pinned : (state.view.groups.find((g) => g.id === groupId)?.apps ?? []);
    const at = siblings.indexOf(app);
    const neighbour = at === -1 ? undefined : (siblings[at + 1] ?? siblings[at - 1]);
    if (neighbour) return this.#tileSelector(groupId, neighbour);
    return pinned ? '.ctl.done' : `[data-rename="${CSS.escape(groupId)}"]`;
  }

  /**
   * Delete a group, and send focus to the next group's handle, else the previous one's, else New
   * group, since the delete button or menu item that took the click goes with the group.
   * @param groupId The group.
   */
  #deleteGroup(groupId: string): void {
    const state = this.#state!;
    const ids = state.view.groups.map((g) => g.id);
    const at = ids.indexOf(groupId);
    const neighbour = at === -1 ? undefined : (ids[at + 1] ?? ids[at - 1]);
    this.#focusNext = neighbour ? `[data-handle="${CSS.escape(neighbour)}"]` : '.newgroup';
    this.#actions.commit(deleteGroup(state.inputs, state.arrangement, groupId));
  }

  /**
   * The selector for one arrange tile, escaped because a group id is the user's or a package's.
   * @param groupId Its group, or the Pinned id.
   * @param app The app.
   * @returns The selector.
   */
  #tileSelector(groupId: string, app: UmbraDesktopApp): string {
    return `.tile.arr[data-group="${CSS.escape(groupId)}"][data-alias="${CSS.escape(app.alias)}"]`;
  }

  /**
   * Keys inside Move to: Escape closes it and returns focus to its button, the arrows walk the
   * items. Every handled key stops here, so it neither moves the tile around it nor, for Escape,
   * reaches the taskbar, which would close the whole launcher.
   * @param e The key event.
   */
  #menuKey = (e: KeyboardEvent) => {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.mmi')];
    const at = items.indexOf(this.#host.shadowRoot?.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      const key = this.#menuFor;
      this.#set(() => {
        this.#menuFor = undefined;
        if (key) this.#focusNext = `[data-menu="${CSS.escape(key)}"]`;
      });
    } else if (e.key === 'ArrowDown') {
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      items[(at - 1 + items.length) % items.length]?.focus();
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * A press anywhere outside an open Move to list closes it, the way a menu does, without the
   * launcher needing a document listener of its own.
   * @param e The press.
   */
  #closeMenuOutside = (e: PointerEvent) => {
    if (this.#menuFor && !(e.target as Element).closest('.movemenu, .mv')) this.#set(() => (this.#menuFor = undefined));
  };

  /**
   * Focus leaving an open Move to list closes it, the way a menu does, so Tab out of it does not
   * leave it hanging open over the tiles. Its own ⋯ button counts as inside: Shift+Tab from the
   * first item lands there, and a press on it closes the list by toggling it. So does the tile it
   * opened from, which is where focus goes when a press lands on the list's heading, since the
   * heading cannot take focus and the tile is its nearest focusable ancestor; a press on the rest of
   * the tile is the outside press {@link #closeMenuOutside} already handles.
   *
   * It closes without moving focus: focus has already gone where the user sent it. And it acts only
   * while a list is open, because the list leaving the DOM after a choice can itself drop focus.
   * @param e The focus event.
   */
  #closeMenuOnFocusOut = (e: FocusEvent) => {
    const key = this.#menuFor;
    const menu = this.#host.shadowRoot?.querySelector('.movemenu');
    if (!key || !menu) return;
    const tile = menu.parentElement;
    const from = e.target as Element;
    const to = e.relatedTarget as Element | null;
    const ours = (element: Element | null) =>
      !!element && (menu.contains(element) || element === tile || (element as HTMLElement).dataset?.menu === key);
    if (ours(from) && !ours(to)) this.#set(() => (this.#menuFor = undefined));
  };

  /**
   * Arrow keys on a focused tile move it within its group: back one, or forward one.
   * @param e The key event.
   * @param app The app.
   * @param groupId Its group, or the Pinned id.
   * @param siblings The apps drawn beside it.
   */
  #tileKey(e: KeyboardEvent, app: UmbraDesktopApp, groupId: string, siblings: ReadonlyArray<UmbraDesktopApp>): void {
    if (e.target !== e.currentTarget) return;
    const at = siblings.indexOf(app);
    let before: UmbraDesktopApp | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (at <= 0) return;
      before = siblings[at - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (at === -1 || at >= siblings.length - 1) return;
      before = siblings[at + 2];
    } else {
      return;
    }
    e.preventDefault();
    const state = this.#state!;
    this.#focusNext = this.#tileSelector(groupId, app);
    this.#actions.commit(
      groupId === UMBRADESKTOP_PINNED_GROUP_ID
        ? pinApp(state.inputs, state.arrangement, app, before)
        : moveApp(state.inputs, state.arrangement, app, groupId, before),
    );
  }

  /**
   * Arrow keys on a focused group handle move the group: back one, or forward one.
   * @param e The key event.
   * @param groupId The group.
   */
  #groupKey(e: KeyboardEvent, groupId: string): void {
    const state = this.#state!;
    const ids = state.view.groups.map((g) => g.id);
    const at = ids.indexOf(groupId);
    let before: string | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (at <= 0) return;
      before = ids[at - 1];
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (at === -1 || at >= ids.length - 1) return;
      before = ids[at + 2];
    } else {
      return;
    }
    e.preventDefault();
    this.#focusNext = `[data-handle="${CSS.escape(groupId)}"]`;
    this.#actions.commit(moveGroup(state.inputs, state.arrangement, groupId, before));
  }

  /**
   * Whether text typed into a group's name field changes the name. Unchanged text does not, so a
   * translated name is not frozen into a literal by tabbing through it. Nor does clearing a group
   * that has nothing to fall back to: a user group cannot be nameless, and a catalogue group that
   * was never renamed already shows its own name.
   * @param group The group.
   * @param typed What is in its field.
   * @returns True when storing it would change the group's name.
   */
  #isRename(group: UmbraDesktopLauncherViewGroup, typed: string): boolean {
    const text = typed.trim();
    if (text === this.#state!.label(group.label)) return false;
    return text !== '' || (!group.custom && !group.label.translate);
  }

  /**
   * Store a rename, or put the shown name back when there is nothing to store. The field is put
   * back by hand because a no-op stores nothing, so nothing re-renders to do it.
   * @param group The group.
   * @param input The rename field.
   */
  #rename(group: UmbraDesktopLauncherViewGroup, input: HTMLInputElement): void {
    const state = this.#state!;
    if (!this.#isRename(group, input.value)) {
      input.value = state.label(group.label);
      return;
    }
    this.#actions.commit(renameGroup(state.inputs, state.arrangement, group.id, input.value));
  }

  /**
   * Keys in a group's name field. Enter stores the name and keeps focus in the field with its text
   * selected, so the keyboard user stays where they were and can type over it again; blurring
   * instead dropped focus to the document, with no visible place to carry on from. Escape puts the
   * shown name back and stops there, so it abandons the typing without also reaching the taskbar,
   * which would close the launcher.
   *
   * The `change` the field fires later, on blur, finds nothing left to store: by then the name it
   * holds is the name the group has.
   * @param e The key event.
   * @param group The group.
   * @param shown The name the group has now.
   */
  #renameKey(e: KeyboardEvent, group: UmbraDesktopLauncherViewGroup, shown: string): void {
    const input = e.target as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.#rename(group, input);
      input.select();
      // Selected again once the stored name has rendered, since a trimmed name replaces the text.
      this.#set(() => (this.#focusNext = `[data-rename="${CSS.escape(group.id)}"]`));
    } else if (e.key === 'Escape') {
      input.value = shown;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** New group: an empty group at the end, with its name selected for typing over. */
  #newGroup = () => {
    const state = this.#state!;
    const id = newGroupId();
    this.#focusNext = `[data-rename="${CSS.escape(id)}"]`;
    this.#actions.commit(createGroup(state.inputs, state.arrangement, id, this.#t('umbraDesktop_arrangeNewGroup')));
  };

  /**
   * Move to > New group: a new group holding this app, with its name selected for typing over.
   * Both edits are chained before one commit, so it is one write to the user's account.
   * @param app The app.
   */
  #moveToNewGroup(app: UmbraDesktopApp): void {
    const state = this.#state!;
    const id = newGroupId();
    const created = createGroup(state.inputs, state.arrangement, id, this.#t('umbraDesktop_arrangeNewGroup'));
    this.#fromMenu(moveApp(state.inputs, created, app, id), `[data-rename="${CSS.escape(id)}"]`);
  }

  /**
   * Where focus goes when something leaves the palette by one of its buttons, which leaves with it:
   * the next row's +, else the next category's Add button, else the filter at the top.
   * @param groups The categories as drawn, filter applied.
   * @param index The category the button was in.
   * @param row The row whose + was pressed; omitted for the category's own Add button, which takes
   * the whole category with it.
   * @returns A selector for what takes focus.
   */
  #afterPaletteAdd(groups: ReadonlyArray<UmbraDesktopPaletteGroup>, index: number, row?: number): string {
    const next = row === undefined ? undefined : groups[index].apps[row + 1];
    if (next) return `.prow[data-alias="${CSS.escape(next.alias)}"] .add`;
    const following = groups[index + 1];
    if (following) return `.addall[data-addall="${CSS.escape(following.group.alias)}"]`;
    return '.palette-filter';
  }

  /**
   * Whether the layout is on screen, which it is not when a narrow panel shows the palette as its
   * own view (design D12). Read from the rendered pane, because the container query decides it.
   * @returns True when the layout pane is drawn.
   */
  #layoutShown(): boolean {
    const pane = this.#host.shadowRoot?.querySelector('.layout-pane');
    return !!pane && pane.getClientRects().length > 0;
  }

  /**
   * The palette: what is not on the launcher, by catalogue group, with Add / Add all / Add group.
   * @param state What to draw from.
   * @returns The palette's contents.
   */
  #palette(state: UmbraDesktopArrangeState) {
    const nameOf = (app: UmbraDesktopApp) => this.#name(app);
    const groups = state.view.palette
      .map((p) => ({ ...p, apps: filterApps(p.apps, nameOf, this.#paletteQuery) }))
      .filter((p) => p.apps.length > 0);
    return html`
      <div class="ph">${this.#t('umbraDesktop_arrangeNotOnLauncher')}</div>
      <input
        class="search palette-filter"
        type="search"
        .value=${this.#paletteQuery}
        placeholder=${this.#t('umbraDesktop_filterApps')}
        aria-label=${this.#t('umbraDesktop_filterApps')}
        @input=${(e: Event) => this.#set(() => (this.#paletteQuery = (e.target as HTMLInputElement).value))}
        @keydown=${(e: KeyboardEvent) => escapeClearsFilter(e, () => this.#set(() => (this.#paletteQuery = '')))} />
      <div class="plist">
        ${state.view.palette.length === 0
          ? html`<p class="empty-note">${this.#t('umbraDesktop_arrangePaletteEmpty')}</p>`
          : groups.length === 0
            ? html`<p class="empty-note">${this.#t('umbraDesktop_noAppsMatch')}</p>`
            : ''}
        ${groups.map(
          (p, index) => html`
            <div class="pgroup">
              <div class="pgh">
                <span class="pgname">${this.#host.localize.string(p.group.label)}</span>
                <button
                  class="ctl addall"
                  data-addall=${p.group.alias}
                  @click=${() => {
                    this.#focusNext = this.#afterPaletteAdd(groups, index);
                    this.#actions.commit(addGroup(state.inputs, state.arrangement, p.group.alias));
                  }}>
                  ${PLUS}
                  <span>${this.#t(p.onLauncher ? 'umbraDesktop_arrangeAddAll' : 'umbraDesktop_arrangeAddGroup')}</span>
                </button>
              </div>
              ${p.apps.map(
                (app, row) => html`
                  <div
                    class="prow"
                    data-alias=${app.alias}
                    @pointerdown=${(e: PointerEvent) => {
                      // The + button is the way to add from a palette that is its own view: there
                      // is no layout on screen to drop on.
                      if ((e.target as Element).closest('button') || !this.#layoutShown()) return;
                      this.#actions.beginDrag(e, { kind: 'app', app, fromPalette: true });
                    }}>
                    <umb-icon name=${app.icon}></umb-icon>
                    <span class="pname">${nameOf(app)}</span>
                    <button
                      class="edit add"
                      title=${this.#t('umbraDesktop_arrangeAddApp')}
                      aria-label=${this.#named('umbraDesktop_arrangeAddAppNamed', nameOf(app))}
                      @click=${() => {
                        this.#focusNext = this.#afterPaletteAdd(groups, index, row);
                        this.#actions.commit(addApp(state.inputs, state.arrangement, app));
                      }}>
                      ${PLUS}
                    </button>
                  </div>
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }
}

/**
 * Arrange mode's CSS, included in the launcher's `static styles`. The split is a container query on
 * the arrange area itself (design D12), so it follows whatever width the theme gives the panel.
 */
export const arrangeStyles = css`
  /* Not plain 'arrange': the Arrange button in the header and in the empty state carries that class,
     and a rule on it turned the button into a column as wide as the search field. */
  .arrange-mode {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    container-type: inline-size;
  }
  .banner {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin: var(--uui-size-space-4) var(--uui-size-space-4) 0;
    padding: var(--uui-size-space-2) var(--uui-size-space-3);
    background: var(--umbradesktop-launcher-banner-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    border: var(--umbradesktop-launcher-banner-border, 1px solid var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border))));
    border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
    color: var(--umbradesktop-launcher-banner-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
  .banner-text {
    flex: 1 1 12em;
    min-width: 0;
  }
  /* One row that fills the arrange area, so each pane scrolls on its own rather than the whole
     split growing past the panel. */
  .split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  .split > .layout-pane,
  .split > .palette {
    min-height: 0;
  }
  .palette {
    display: none;
    flex-direction: column;
    gap: var(--uui-size-space-2);
    padding: var(--uui-size-space-4);
    overflow: auto;
  }
  .split.show-palette > .layout-pane {
    display: none;
  }
  .split.show-palette > .palette {
    display: flex;
  }
  @container (min-width: ${unsafeCSS(UMBRADESKTOP_LAUNCHER_SPLIT_MIN)}px) {
    .split,
    .split.show-palette {
      grid-template-columns: minmax(0, 1fr) ${unsafeCSS(UMBRADESKTOP_LAUNCHER_PALETTE_WIDTH)}px;
    }
    .split > .layout-pane,
    .split.show-palette > .layout-pane {
      display: flex;
    }
    .split > .palette {
      display: flex;
      border-left: var(--umbradesktop-launcher-divider, 1px solid var(--uui-color-border));
    }
    .banner .add-apps {
      display: none;
    }
    .palette .prow {
      cursor: move;
    }
  }
  /* Wraps so Pinned's hint can drop onto a line of its own when it and the heading do not fit side by
     side, as Dutch does in the narrow themes. A group card's row never wraps: its name field starts
     from no width at all, so the row always fits. */
  .gh {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin: 0 0 var(--uui-size-space-3);
  }
  /* A group's menu opens under its heading row, whatever height the name field gives that row. */
  .gh > .movemenu {
    top: 100%;
  }
  /* Where a dragged group would land: a bar in the middle of the gap before or after the card it
     would go beside. Down the card's side when the cards sit side by side, across its top or bottom
     when they are stacked (drop-stacked). The gap is the theme's to size, so the drag measures it and
     sets --launcher-drop-gap on that card; a theme with none puts the bar on the card's edge. Half
     the gap out, less half the bar's 2px. Above the card's contents, and above a heading a theme
     lifts, as Umbraco 4 lifts its sticky strips to 2, but below an open menu at 10. */
  .agroup {
    position: relative;
  }
  .agroup.drop-before::before,
  .agroup.drop-after::after {
    content: '';
    position: absolute;
    z-index: 5;
    top: 0;
    bottom: 0;
    border-left: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
    pointer-events: none;
  }
  .agroup.drop-before::before {
    left: calc(var(--launcher-drop-gap, 0px) / -2 - 1px);
  }
  .agroup.drop-after::after {
    right: calc(var(--launcher-drop-gap, 0px) / -2 - 1px);
  }
  .agroup.drop-stacked::before,
  .agroup.drop-stacked::after {
    top: auto;
    bottom: auto;
    left: 0;
    right: 0;
    border-left: none;
    border-top: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
  }
  .agroup.drop-stacked.drop-before::before {
    top: calc(var(--launcher-drop-gap, 0px) / -2 - 1px);
  }
  .agroup.drop-stacked.drop-after::after {
    bottom: calc(var(--launcher-drop-gap, 0px) / -2 - 1px);
  }
  /* Starts from its text's width rather than none, or it never pushes the hint onto the next line: it
     shrinks to nothing instead and its text prints over the hint's. */
  .gname {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--uui-type-h5-size, 16px);
  }
  /* Shrinks, and wraps inside its own box, once it has a line to itself and still does not fit. It
     does not grow, so beside the heading it still sits at the row's end. */
  .gh .hint {
    min-width: 0;
  }
  .hint,
  .mmh {
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
  .handle,
  .gdel,
  .edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${unsafeCSS(EDIT_BUTTON_PX)}px;
    height: ${unsafeCSS(EDIT_BUTTON_PX)}px;
    padding: 0;
    border: var(--umbradesktop-launcher-control-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
    border-radius: 50%;
    background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    color: var(--umbradesktop-launcher-control-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    cursor: pointer;
  }
  .handle {
    border: none;
    background: transparent;
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    cursor: move;
  }
  .handle:hover,
  .gdel:hover,
  .edit:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  .edit svg,
  .addall svg {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
  }
  /* The remove icon, the same trash as a group's delete beside it. Scoped to the tile, so it outranks
     the rule that sizes the app's own icon in the tile, which a theme restates at its own size. */
  .tile.arr .edit umb-icon,
  .gdel umb-icon {
    font-size: 13px;
  }
  .rename {
    flex: 1;
    min-width: 0;
    padding: 2px var(--uui-size-space-2);
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
    background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-default-size, 14px);
  }
  .tile.arr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--uui-size-space-1);
    /* The icon starts below the remove and ⋯ buttons in the top corners rather than between them: a tile
       narrower than the icon plus both buttons (the default theme's are, at a 1920px screen) put
       them over the icon. Themes that make tiles rows put the buttons in the flow and set their own
       padding. */
    padding: ${unsafeCSS(EDIT_INSET_PX + EDIT_BUTTON_PX)}px var(--uui-size-space-1) var(--uui-size-space-2);
    border: 1px dashed var(--umbradesktop-launcher-text-muted, var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    text-align: center;
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .tile.arr:focus-visible {
    outline: 2px solid var(--uui-color-focus, #3544b1);
    outline-offset: 1px;
  }
  .tile.arr umb-icon {
    font-size: 26px;
  }
  .tile.arr .edit {
    position: absolute;
    top: ${unsafeCSS(EDIT_INSET_PX)}px;
    width: ${unsafeCSS(EDIT_BUTTON_PX)}px;
    height: ${unsafeCSS(EDIT_BUTTON_PX)}px;
  }
  .tile.arr .rm {
    left: ${unsafeCSS(EDIT_INSET_PX)}px;
  }
  .tile.arr .mv {
    right: ${unsafeCSS(EDIT_INSET_PX)}px;
  }
  /* The panel's background, not the card's: Windows 11 and macOS make cards transparent or nearly
     so, and a list drawn over tiles must be opaque enough to read. */
  .movemenu {
    position: absolute;
    top: ${unsafeCSS(2 * EDIT_INSET_PX + EDIT_BUTTON_PX)}px;
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: var(--uui-size-space-1) 0;
    background: var(--umbradesktop-launcher-background, var(--uui-color-surface));
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    box-shadow: var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-3));
    text-align: left;
    cursor: default;
  }
  /* The sides placeMenu picks when the default ones would leave the layout pane. */
  .movemenu.flip-x {
    left: auto;
    right: 0;
  }
  .movemenu.flip-y {
    top: auto;
    bottom: 100%;
  }
  .mmh {
    padding: var(--uui-size-space-1) var(--uui-size-space-3);
  }
  .mmi {
    padding: var(--uui-size-space-2) var(--uui-size-space-3);
    border: none;
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    text-align: left;
    cursor: pointer;
  }
  .mmi:hover,
  .mmi:focus-visible {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
    outline: none;
  }
  .mmi.new {
    border-top: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
  }
  .mmi.rmv {
    color: var(--umbradesktop-launcher-remove-text, var(--uui-color-danger, #d42054));
  }
  .newgroup {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--uui-size-space-2);
    min-height: 96px;
    border-style: dashed;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    cursor: pointer;
  }
  .ph,
  .pgh {
    font-weight: 700;
    font-size: var(--uui-type-small-size);
  }
  /* The base search rule gives it flex: 1, which in this column would stretch it vertically, and a
     pointer cursor, which is wrong for a field the user types into. */
  .palette .search {
    flex: none;
    cursor: text;
  }
  .pgroup {
    display: flex;
    flex-direction: column;
    gap: var(--uui-size-space-1);
  }
  .pgh {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-2);
    margin-top: var(--uui-size-space-2);
  }
  .pgname {
    flex: 1;
    min-width: 0;
  }
  .addall {
    gap: var(--uui-size-space-1);
    min-height: ${unsafeCSS(EDIT_BUTTON_PX)}px;
    padding: 0 var(--uui-size-space-2);
  }
  .prow {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-2);
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
    border-radius: var(--uui-border-radius, 3px);
    background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-size: var(--uui-type-small-size);
    /* A row drags only while the layout is beside it to drop on; the container query above turns
       the move cursor on for exactly that case, and the + button adds in either. */
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .prow umb-icon {
    flex-shrink: 0;
    font-size: 18px;
  }
  .pname {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;
