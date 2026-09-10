import './ai.extension';

/**
 * What the desktop contributes to Umbraco AI: three frontend tools, and nothing else.
 *
 * The premise they serve is that the agent should know what the desktop can do and what state it is
 * in. Everything about *content* it can already do server-side, so the only things worth adding are
 * the ones only the desktop can answer: what is on the desk, putting something on it, and clearing
 * it again.
 *
 * **They are tools rather than one tool and one ambient contributor.** A
 * `uaiRequestContextContributor` would have described the desk once per message, with no thinking
 * required of the agent, and that is what this shipped as first. It never fired: the Copilot
 * Workspace does not invoke `UaiRequestContextCollector`, and the only thing in Umbraco AI that
 * does is the sidebar Copilot. Frontend tools the Workspace does wire up, so tools are the seam
 * that exists rather than the seam that reads best.
 *
 * On an install without AI nothing queries these types, so they sit in the registry unread and
 * their `api` modules are never imported — which is the whole of how this feature degrades to
 * absent. See `ai.extension.ts` for why the types are transcribed rather than imported.
 *
 * None of them is gated by a condition, because AI has none to gate with yet: per-surface conditions
 * for frontend tools are explicitly not implemented in its first pass, so a registered tool resolves
 * in every chat surface including a plain backoffice with no desktop. Each api answers for that case
 * instead, by asking `host-desk.ts` and finding nothing.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'uaiAgentFrontendTool',
    alias: 'UmbraDesktop.AgentFrontendTool.DescribeDesktop',
    name: 'UmbraDesktop Describe Desktop Tool',
    api: () => import('./describe-desktop.tool.api.js'),
    meta: {
      toolName: 'describe_desktop',
      // The description carries the whole burden of *when* to call this, because nothing calls it
      // automatically. Both halves are spelled out — the state and the capability — since the
      // second is the one a model would not think to ask for.
      description:
        'Describe the user\'s UmbraDesktop: which windows are open, what each one is showing, ' +
        'which is in front, and which are holding unsaved changes, plus the names of the apps that ' +
        'can be opened in a window. Call this whenever the user refers to their windows or to what ' +
        'they have open ("the page I have open", "what am I working on"), whenever you need to know ' +
        'what this desktop is able to open before offering to open something, and before writing to ' +
        'a document, so you can warn the user if they have that document open with unsaved changes ' +
        'that your write would overwrite. Takes no arguments. If the backoffice is not running ' +
        'inside UmbraDesktop it says so, and you should then answer without referring to windows.',
      parameters: { type: 'object', properties: {} },
      scope: 'navigation',
    },
  },
  {
    type: 'uaiAgentFrontendTool',
    alias: 'UmbraDesktop.AgentFrontendTool.OpenWindow',
    name: 'UmbraDesktop Open Window Tool',
    api: () => import('./open-window.tool.api.js'),
    meta: {
      toolName: 'open_desktop_window',
      // Two ways to call it, so the description leads with the choice rather than with either.
      // The last sentence matters more than it looks: without it a model that gets "not available
      // here" tends to apologise and retry, or offer a link, rather than simply answering.
      description:
        'Open something in its own window on the user\'s UmbraDesktop, beside this conversation. ' +
        'Either pass "entityType" and "unique" to open a content document or media item, or pass ' +
        '"app" with the name of one of the desktop\'s apps, such as the Log Viewer. Use it when the ' +
        'user asks to see, open or edit something specific, or when your answer points at something ' +
        'they will want to work on: unlike a link, this does not navigate away from the chat, so the ' +
        'conversation survives. If the thing is already open, its window is brought to the front ' +
        'instead, unless you pass "newWindow". Call describe_desktop first if you need to know ' +
        'which apps exist. This only works ' +
        'when the backoffice is running inside UmbraDesktop; if it is not, the tool says so and you ' +
        'should answer normally without offering to open anything.',
      parameters: {
        type: 'object',
        properties: {
          entityType: {
            type: 'string',
            enum: ['document', 'media'],
            description: 'For content: whether the item is a document or a media item.',
          },
          unique: {
            type: 'string',
            description:
              "For content: the item's GUID key, as returned by the Umbraco content and media tools.",
          },
          name: {
            type: 'string',
            description:
              "For content: the item's name. Optional, used as the window's title, so pass it when you know it.",
          },
          app: {
            type: 'string',
            description:
              'For a desktop app: its name as describe_desktop reports it. Do not combine this with entityType.',
          },
          newWindow: {
            type: 'boolean',
            description:
              'Open a second window even if the thing is already open, instead of bringing the ' +
              'existing one to the front. Only when the user asked for another one, for example ' +
              'to see two editors on the same document side by side. Note that two editors on one ' +
              'document is the situation the overwrite warning exists for, so say so when you do it.',
          },
        },
      },
      // Matches the scope Umbraco's own `get_page_info` frontend tool declares. It groups
      // permissions and, server-side, can filter a tool out for entity types the scope does not
      // declare — `navigation` declares none, so it is offered everywhere.
      scope: 'navigation',
    },
  },
  {
    type: 'uaiAgentFrontendTool',
    alias: 'UmbraDesktop.AgentFrontendTool.CloseWindows',
    name: 'UmbraDesktop Close Windows Tool',
    api: () => import('./close-windows.tool.api.js'),
    meta: {
      toolName: 'close_desktop_windows',
      // The two guarantees are stated for the model as well as enforced in code, so it can promise
      // them to the user rather than hedging about what might happen.
      description:
        "Close windows on the user's UmbraDesktop. Pass \"apps\" with the names of the windows " +
        'to close, or omit it to close all of them. Two things are guaranteed: a window holding ' +
        'unsaved changes is never closed, only reported back to you, and this chat\'s own window ' +
        'is never closed. So it is safe to call for "close everything" — anything with unsaved ' +
        'work will still be there afterwards, and the result tells you which. Call ' +
        'describe_desktop first if you need to know what is open. This only works when the ' +
        'backoffice is running inside UmbraDesktop; if it is not, the tool says so.',
      parameters: {
        type: 'object',
        properties: {
          apps: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Names of the windows to close, as describe_desktop reports them. Omit to close every window.',
          },
        },
      },
      scope: 'navigation',
      // Marked because it changes the desk rather than reads it. It cannot destroy unsaved work by
      // construction, so it needs no approval step of its own.
      isDestructive: true,
    },
  },
];
