import { useEffect, useRef } from 'react';
import { EditorState, type Text } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { selectAll, indentSelection } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter, forceLinting, type Diagnostic } from '@codemirror/lint';
import {
  autocompletion,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';

interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
  /** Compile/runtime error from the playground engine — shown as inline lint marker. */
  compilationError?: string | null;
}

/**
 * Parse a Sucrase-style "(line:col)" error string into a CM6 Diagnostic.
 * Falls back to underlining the whole document if no position is found.
 */
function errorToDiagnostics(error: string, doc: Text): Diagnostic[] {
  const match = error.match(/\((\d+):(\d+)\)$/);
  if (match) {
    const lineNum = Math.min(parseInt(match[1], 10), doc.lines);
    const col = parseInt(match[2], 10);
    const line = doc.line(lineNum);
    const from = Math.min(line.from + col, line.to);
    return [{ from, to: line.to, severity: 'error', message: error }];
  }
  return [{ from: 0, to: doc.length, severity: 'error', message: error }];
}

// ---------------------------------------------------------------------------
// Autocompletion — injected globals + common SVG elements
// ---------------------------------------------------------------------------

const HOOK_COMPLETIONS = [
  snippetCompletion('useInput("${label}", "${defaultValue}")', {
    label: 'useInput',
    detail: '(label, defaultValue?) → string',
    info: 'Registers a text input control in the Tools panel. Returns the current string value.',
    type: 'function',
    boost: 10,
  }),
  snippetCompletion('useRange("${label}", ${min}, ${max}, ${defaultValue}, ${step})', {
    label: 'useRange',
    detail: '(label, min, max, defaultValue?, step?) → number',
    info: 'Registers a range slider in the Tools panel. Returns the current numeric value.',
    type: 'function',
    boost: 10,
  }),
];

// React.* member completions — React is injected into the function scope
const REACT_MEMBER_COMPLETIONS = [
  snippetCompletion('useState(${initialState})', {
    label: 'useState',
    detail: '(initialState) → [state, setState]',
    info: 'Returns a stateful value and a function to update it.',
    type: 'function',
  }),
  snippetCompletion('useEffect(() => {\n  ${}\n}, [${deps}])', {
    label: 'useEffect',
    detail: '(effect, deps?) → void',
    info: 'Runs a side effect after render. Pass an empty array to run once on mount.',
    type: 'function',
  }),
  snippetCompletion('useMemo(() => ${expression}, [${deps}])', {
    label: 'useMemo',
    detail: '(factory, deps) → value',
    info: 'Memoizes a computed value, recalculating only when dependencies change.',
    type: 'function',
  }),
  snippetCompletion('useCallback(${fn}, [${deps}])', {
    label: 'useCallback',
    detail: '(fn, deps) → fn',
    info: 'Returns a memoized callback that only changes when dependencies change.',
    type: 'function',
  }),
  snippetCompletion('useRef(${initialValue})', {
    label: 'useRef',
    detail: '(initialValue) → RefObject',
    info: 'Returns a mutable ref object whose .current property is initialized to the argument.',
    type: 'function',
  }),
  snippetCompletion('useReducer(${reducer}, ${initialState})', {
    label: 'useReducer',
    detail: '(reducer, initialState) → [state, dispatch]',
    info: 'An alternative to useState for complex state logic.',
    type: 'function',
  }),
  snippetCompletion('useContext(${Context})', {
    label: 'useContext',
    detail: '(Context) → value',
    info: 'Reads and subscribes to a React context.',
    type: 'function',
  }),
  snippetCompletion('useId()', {
    label: 'useId',
    detail: '() → string',
    info: 'Generates a unique stable ID for accessibility attributes.',
    type: 'function',
  }),
  snippetCompletion('createContext(${defaultValue})', {
    label: 'createContext',
    detail: '(defaultValue) → Context',
    info: 'Creates a React context object.',
    type: 'function',
  }),
  snippetCompletion('memo(${Component})', {
    label: 'memo',
    detail: '(Component) → Component',
    info: 'Wraps a component to skip re-renders when props are unchanged.',
    type: 'function',
  }),
  snippetCompletion('Fragment', {
    label: 'Fragment',
    detail: 'React.Fragment',
    info: 'Groups elements without adding extra DOM nodes. Shorthand: <>...</>',
    type: 'variable',
  }),
];

const SVG_SNIPPETS = [
  snippetCompletion('<svg width="${400}" height="${400}" viewBox="${0 0 400 400}">\n  ${}\n</svg>', {
    label: '<svg',
    detail: 'SVG root element',
    type: 'keyword',
  }),
  snippetCompletion('<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />', {
    label: '<circle',
    detail: 'SVG circle',
    type: 'keyword',
  }),
  snippetCompletion('<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" />', {
    label: '<rect',
    detail: 'SVG rectangle',
    type: 'keyword',
  }),
  snippetCompletion('<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" />', {
    label: '<ellipse',
    detail: 'SVG ellipse',
    type: 'keyword',
  }),
  snippetCompletion('<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" />', {
    label: '<line',
    detail: 'SVG line',
    type: 'keyword',
  }),
  snippetCompletion('<path d="${d}" fill="${fill}" />', {
    label: '<path',
    detail: 'SVG path',
    type: 'keyword',
  }),
  snippetCompletion('<polygon points="${points}" fill="${fill}" />', {
    label: '<polygon',
    detail: 'SVG polygon',
    type: 'keyword',
  }),
  snippetCompletion(
    '<text x="${x}" y="${y}" textAnchor="${middle}" fill="${fill}">${text}</text>',
    { label: '<text', detail: 'SVG text', type: 'keyword' }
  ),
  snippetCompletion('<g transform="${transform}">\n  ${}\n</g>', {
    label: '<g',
    detail: 'SVG group',
    type: 'keyword',
  }),
];

// React namespace — inserts 'React.' and immediately opens member completions
const REACT_NAMESPACE_COMPLETION = {
  label: 'React',
  detail: 'injected React namespace',
  info: 'The React namespace injected into every playground component. Type React. to see hooks and utilities.',
  type: 'variable' as const,
  boost: 5,
  apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
    view.dispatch({ changes: { from, to, insert: 'React.' } });
    startCompletion(view);
  },
};

const ALL_COMPLETIONS = [REACT_NAMESPACE_COMPLETION, ...HOOK_COMPLETIONS, ...SVG_SNIPPETS];

function playgroundCompletionSource(context: CompletionContext): CompletionResult | null {
  // React.* member completions
  const reactMember = context.matchBefore(/React\.\w*/);
  if (reactMember) {
    return {
      from: reactMember.from + 'React.'.length,
      options: REACT_MEMBER_COMPLETIONS,
      validFor: /^\w*$/,
    };
  }

  // Top-level completions (useInput, useRange, SVG snippets)
  const word = context.matchBefore(/<?[\w]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: ALL_COMPLETIONS, validFor: /^<?[\w]*$/ };
}

// Language extension — shared across editor instances, stable reference
const lang = javascript({ jsx: true, typescript: true });

// Register playground completions alongside the language's own completions
const playgroundCompletions = lang.language.data.of({ autocomplete: playgroundCompletionSource });

// ---------------------------------------------------------------------------

export function CodeEditor({ value, onChange, compilationError }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const errorRef = useRef<string | null>(compilationError ?? null);

  // Keep callback ref up to date without recreating the editor
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lang,
          playgroundCompletions,
          // autocompletion is already included via basicSetup; override keeps our source active
          autocompletion({ activateOnTyping: true }),
          lintGutter(),
          linter((v) => {
            if (!errorRef.current) return [];
            return errorToDiagnostics(errorRef.current, v.state.doc);
          }, { delay: 0 }),
          oneDark,
          keymap.of([
            {
              key: 'Mod-s',
              run: (view) => {
                selectAll(view);
                indentSelection(view);
                return true; // intercept browser save dialog
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync value prop → editor content when it changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (currentContent !== value) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: value },
      });
    }
  }, [value]);

  // Sync compilation error → inline lint diagnostics
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    errorRef.current = compilationError ?? null;
    forceLinting(view);
  }, [compilationError]);

  return <div ref={containerRef} className="code-editor" style={{ height: '100%' }} />;
}
