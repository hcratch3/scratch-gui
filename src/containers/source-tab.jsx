import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import { connect } from 'react-redux';

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
// ... activateTab, setRestore などは必要に応じて残す ...
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// --- uiwjs/react-codemirror をインポート ---
import CodeMirror from '@uiw/react-codemirror';

// --- CodeMirror 6 のコアおよび基本セットアップ関連 ---
// EditorState, EditorView の直接のインポートは不要になることが多い
// ただし、特定の拡張機能内でこれらを使う場合は必要になる
import { EditorState } from '@codemirror/state'; // 例えば myLinter で使う場合
import { EditorView, highlightActiveLine, drawSelection, dropCursor, crosshairCursor } from '@codemirror/view'; // view 関連の拡張機能
import { lineNumbers, highlightActiveLineGutter, foldGutter } from '@codemirror/gutter';
import { history, historyKeymap } from '@codemirror/history';
import { indentOnInput, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { bracketMatching } from '@codemirror/matchbrackets';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/closebrackets';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { commentKeymap } from '@codemirror/comment';
import { lintKeymap, linter, Diagnostic } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { foldKeymap } from '@codemirror/fold';
import { rectangularSelection } from '@codemirror/rectangular-selection';
import { keymap } from '@codemirror/view'; // キーマップの適用
import { highlightSpecialChars } from '@codemirror/highlight'; // highlight からではなく、view からインポートすべき

// --- 言語固有の拡張機能 ---
import { javascript } from '@codemirror/lang-javascript';

// --- オプション: Vim/Emacs キーマップ (必要な場合のみ) ---
// import { vim } from '@replit/codemirror-vim';
// import { emacs } from '@codemirror/emacs';

class SourceTab extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleCodeChange',
            'handleRunCode',
            'handleSaveCode'
        ]);
        // this.editorRef はもう必要ない
        // this.editorView ももう直接管理しない

        this.state = {
            spriteCode: this.initializeSpriteCode(props.sprites, props.stage),
            selectedSpriteId: props.editingTarget
        };
    }

    // componentDidMount でエディターを初期化する必要はもうない
    // componentDidUpdate も、value を props/state から CodeMirror コンポーネントに渡すため、簡素化される

    // componentWillUnmount も CodeMirror コンポーネントが内部で管理するため、基本的には不要

    initializeSpriteCode(sprites, stage) {
        const codeMap = {};
        Object.keys(sprites).forEach((spriteId) => {
            codeMap[spriteId] = '';
        });
        if (stage) {
            codeMap[stage.id] = '';
        }
        return codeMap;
    }

    // handleCodeChange は CodeMirror コンポーネントの onChange プロパティに渡す
    handleCodeChange = (newCode) => {
        const { selectedSpriteId, spriteCode } = this.state;

        this.setState({
            spriteCode: {
                ...spriteCode,
                [selectedSpriteId]: newCode
            }
        });
    };

    // runCode, saveCode は既存のまま

    handleRunCode = () => {
        // ... 既存のロジック ...
        const { vm } = this.props;
        const { selectedSpriteId, spriteCode } = this.state;
        const codeToRun = spriteCode[selectedSpriteId] || '';

        if (!codeToRun) {
            console.warn('No code to run for the selected sprite.');
            return;
        }

        try {
            const target = vm.runtime.getTargetById(selectedSpriteId);
            if (target) {
                const Scratch = {
                    move: (steps) => {
                        vm.runtime.requestAddBlock({
                            opcode: 'motion_movesteps',
                            fields: { STEPS: steps },
                            targetId: selectedSpriteId
                        });
                        vm.runtime.sequencer.step();
                    },
                    say: (message) => {
                        console.log(`Sprite ${target.name} says: ${message}`);
                    },
                    setX: (x) => target.setXY(x, target.y),
                    setY: (y) => target.setXY(target.x, y),
                    changeX: (dx) => target.setXY(target.x + dx, target.y),
                    changeY: (dy) => target.setXY(target.x, target.y + dy),
                    turnRight: (degrees) => target.setDirection(target.direction + degrees),
                    turnLeft: (degrees) => target.setDirection(target.direction - degrees),
                    getVar: (name) => target.lookupVariableByNameAndType(name).value,
                    setVar: (name, value) => {
                        const variable = target.lookupVariableByNameAndType(name);
                        if (variable) variable.value = value;
                    }
                };
                const scriptFunction = new Function('Scratch', codeToRun);
                scriptFunction(Scratch);
            } else {
                console.error('Selected target not found in VM:', selectedSpriteId);
            }
            console.log('Code execution attempt dispatched!');
        } catch (error) {
            console.error('Error executing code:', error);
        }
    };

    handleSaveCode = () => {
        const codeToSave = this.state.spriteCode[this.state.selectedSpriteId] || '';
        console.log('Saving code for sprite:', this.state.selectedSpriteId, codeToSave);
        // 保存ロジック
    };

    render() {
        if (!this.props.vm || !this.props.vm.editingTarget) {
            return null;
        }

        const currentCode = this.state.spriteCode[this.state.selectedSpriteId] || '';

        // ★ カスタムリンターの例: 'hoge'という単語を警告
        const myLinter = linter((view) => {
            let diagnostics = [];
            const doc = view.state.doc.toString();
            const hogeRegex = /hoge/g;
            let match;
            while ((match = hogeRegex.exec(doc)) !== null) {
                diagnostics.push({
                    from: match.index,
                    to: match.index + match[0].length,
                    severity: 'warning',
                    message: "'hoge' is a potentially problematic word here."
                });
            }
            return diagnostics;
        });

        const codeMirrorExtensions = [
            // CodeMirror 6 の拡張機能をここにリストする
            // basicSetup は使わないので、個々の機能を追加
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(), // @codemirror/view から
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(), // @codemirror/view から
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(), // @codemirror/view から
            highlightActiveLine(),
            highlightSelectionMatches(),
            
            // デフォルトのシンタックスハイライトスタイルを適用
            // defaultHighlightStyle.fallback, // uiw のテーマを使う場合は不要なこともある

            javascript(), // JavaScript 言語サポート

            myLinter, // カスタムリンターの適用

            keymap.of([
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...commentKeymap,
                ...completionKeymap,
                ...closeBracketsKeymap,
                ...lintKeymap,
            ]),

            // uiwjs/react-codemirror にはテーマを設定するプロパティがある
            // 例: basicDark
            // import { basicDark } from '@uiw/codemirror-theme-basic';
            // basicDark
        ];


        return (
            <div
                className={styles.source}
                ref={this.props.setRef}
                onMouseDown={this.props.onContainerClick}
            >
                {/* ツールバー */}
                <div className={styles.toolbar}>
                    <button onClick={this.handleRunCode}>実行</button>
                    <button onClick={this.handleSaveCode}>保存</button>
                </div>
                {/* エディター本体 */}
                <div className={styles.editorContainer}>
                    <CodeMirror
                        value={currentCode}
                        height="100%" // 親要素の `editorContainer` が `flex-grow: 1` で高さを占めるため、ここは `100%` に設定
                        extensions={codeMirrorExtensions}
                        onChange={this.handleCodeChange}
                        // CodeMirror の他のオプションをプロパティとして渡す
                        // 例: theme={basicDark}
                    />
                </div>
            </div>
        );
    }
}

SourceTab.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.object.isRequired,
    stage: PropTypes.object,
    setRef: PropTypes.func,
    onContainerClick: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = (state) => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    vm: state.scratchGui.vm
});

export default errorBoundaryHOC('Source Tab')(
    connect(mapStateToProps)(SourceTab)
);