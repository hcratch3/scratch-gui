import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import { connect } from 'react-redux';

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// --- uiwjs/react-codemirror をインポート ---
import CodeMirror from '@uiw/react-codemirror';

// --- CodeMirror 6 の拡張機能をインポート (すべて ^6.x.x 系) ---
// Note: @codemirror/fold は ^6.x.x 系が利用できないため、ここでは使用しません。
//       もし将来的に利用可能になった場合、再度追加を検討してください。

// コア:
import { EditorState } from '@codemirror/state'; // リンターなどで使う可能性あり
import { EditorView, highlightActiveLine, drawSelection, dropCursor, crosshairCursor, keymap } from '@codemirror/view';
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/gutter'; // foldGutter は削除
import { history, historyKeymap } from '@codemirror/history';
import { indentOnInput, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { bracketMatching } from '@codemirror/matchbrackets';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/closebrackets';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { commentKeymap } from '@codemirror/comment';
import { lintKeymap, linter, Diagnostic } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
// import { foldKeymap } from '@codemirror/fold'; // foldKeymap は削除
import { rectangularSelection } from '@codemirror/rectangular-selection';
import { highlightSpecialChars } from '@codemirror/highlight'; // ハイライト関連

// コマンドのデフォルトキーマップ
import { defaultKeymap } from '@codemirror/commands';

// 言語固有の拡張機能:
import { javascript } from '@codemirror/lang-javascript';

// テーマ (uiw/react-codemirror には様々なテーマがあります。必要であればインストールしてインポート)
// 例: npm install @uiw/codemirror-theme-basic
// import { basicLight } from '@uiw/codemirror-theme-basic';

class SourceTab extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleCodeChange',
            'handleRunCode',
            'handleSaveCode'
        ]);

        this.state = {
            spriteCode: this.initializeSpriteCode(props.sprites, props.stage),
            selectedSpriteId: props.editingTarget
        };
    }

    // React コンポーネントのライフサイクルメソッド。
    // CodeMirror インスタンスの直接管理は @uiw/react-codemirror が行うため、
    // componentDidMount や componentWillUnmount での複雑な処理は不要になりました。

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

    // CodeMirror コンポーネントの onChange イベントから新しいコードを受け取ります
    handleCodeChange = (newCode) => {
        const { selectedSpriteId, spriteCode } = this.state;
        this.setState({
            spriteCode: {
                ...spriteCode,
                [selectedSpriteId]: newCode
            }
        });
        // 必要に応じて、ここで親コンポーネントにコードの変更を通知できます
        // 例: this.props.onCodeChange(newCode);
    };

    // runCode, saveCode は既存のロジックを維持します
    handleRunCode = () => {
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
                // Scratch 互換 API を提供するオブジェクト
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
                // ユーザーコードを関数として実行
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
        // 保存ロジックをここに追加
    };

    render() {
        if (!this.props.vm || !this.props.vm.editingTarget) {
            return null;
        }

        const currentCode = this.state.spriteCode[this.state.selectedSpriteId] || '';

        // カスタムリンターの定義例: "Scratch." の後に続く未定義の関数呼び出しを警告
        const myLinter = linter((view) => {
            let diagnostics = [];
            const doc = view.state.doc.toString();
            const scratchCallRegex = /Scratch\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g; // () が続く関数呼び出しに限定
            let match;
            while ((match = scratchCallRegex.exec(doc)) !== null) {
                const funcName = match[1];
                // Scratch オブジェクトに存在する許可された関数リスト
                const allowedScratchFunctions = [
                    'move', 'say', 'setX', 'setY', 'changeX', 'changeY',
                    'turnRight', 'turnLeft', 'getVar', 'setVar'
                ];
                if (!allowedScratchFunctions.includes(funcName)) {
                    diagnostics.push({
                        from: match.index + 'Scratch.'.length,
                        to: match.index + match[0].length - 1, // '(' の直前まで
                        severity: 'warning',
                        message: `"${funcName}" is not a recognized Scratch function.`
                    });
                }
            }
            return diagnostics;
        });

        // CodeMirror に渡す拡張機能のリスト
        const codeMirrorExtensions = [
            // 基本機能:
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(), // @codemirror/highlight からではなく、@codemirror/view からインポート
            history(),
            // foldGutter(), // @codemirror/fold が ^6.x.x 系で利用できないため削除
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),

            // 言語固有のハイライトと構造:
            javascript(), // JavaScript 言語サポート

            // 自動補完 (JavaScript 言語のコンテキストで機能するように)
            autocompletion(),

            // カスタムリンター:
            myLinter,

            // キーマップの結合:
            // defaultKeymap は @codemirror/commands から
            // その他のキーマップはそれぞれの機能パッケージから
            keymap.of([
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                // ...foldKeymap, // foldKeymap も削除
                ...commentKeymap,
                ...completionKeymap,
                ...closeBracketsKeymap,
                ...lintKeymap,
            ]),

            // uiw/react-codemirror が提供するテーマ（オプション）
            // 例: basicLight (要インストール)
            // basicLight
        ];

        return (
            <div
                className={styles.source}
                // setRef は props 経由で親コンポーネントが DOM 要素を参照するために必要
                ref={this.props.setRef}
                // onContainerClick も親コンポーネントからのイベントハンドラ
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
                        value={currentCode} // エディターの現在の内容を state から渡す
                        height="100%"       // 親要素の高さに合わせる
                        extensions={codeMirrorExtensions} // 適用する CodeMirror 拡張機能のリスト
                        onChange={this.handleCodeChange} // コード変更時のコールバック
                        // その他の CodeMirror オプション（例: theme）
                        // theme={basicLight} // ここでテーマを適用
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
    setRef: PropTypes.func, // 親コンポーネントから渡される DOM 参照用 prop
    onContainerClick: PropTypes.func.isRequired, // 親コンポーネントから渡されるクリックハンドラ
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