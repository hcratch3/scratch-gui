import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import { connect } from 'react-redux';

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
// import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab'; // 必要に応じて
// import { setRestore } from '../reducers/restore-deletion'; // 必要に応じて
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// --- CodeMirror 6 のコアおよび基本セットアップ関連 ---
import { EditorState } from '@codemirror/state';
import { EditorView, lineWrapping, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands'; // デフォルトのキーバインド
import { history, historyKeymap } from '@codemirror/history'; // 変更履歴、Undo/Redo
import { indentOnInput } from '@codemirror/language'; // 自動インデント
import { bracketMatching } from '@codemirror/matchbrackets'; // 括弧のマッチング
import { closeBrackets, closeBracketsKeymap } from '@codemirror/closebrackets'; // 括弧の自動閉じ
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'; // 自動補完
import { commentKeymap } from '@codemirror/comment'; // コメントアウト
import { lintKeymap, linter, Diagnostic } from '@codemirror/lint'; // Linting
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'; // 検索・置換
import { foldKeymap, foldGutter } from '@codemirror/fold'; // コードの折りたたみ
import { rectangularSelection } from '@codemirror/rectangular-selection'; // 矩形選択

// --- 言語固有の拡張機能 ---
import { javascript } from '@codemirror/lang-javascript'; // JavaScript 言語モード

// --- その他のユーティリティ拡張機能 ---
import { keymap } from '@codemirror/view'; // キーマップの適用
import { drawSelection, highlightActiveLineGutter } from '@codemirror/view'; // 選択範囲の描画、アクティブ行のガッターハイライト
import { lineNumbers } from '@codemirror/gutter'; // 行番号
import { defaultHighlightStyle } from '@codemirror/highlight'; // デフォルトの構文ハイライトスタイル
import { EditorStateField } from '@codemirror/state';

// --- CodeMirror テーマ (例として) ---
// CodeMirror 6 は npm からテーマをインポートすることが一般的です。
// ここではCSSを直接インポートする例ですが、
// @uiw/codemirror-theme-dracula のようなパッケージを使うこともできます。
// デフォルトのハイライトスタイルが含まれるため、基本的にはこれだけでOK
// もし独自のテーマを使う場合は、別途CSSをインポートするか、テーマ拡張を適用します。
// 例: import { oneDark } from '@codemirror/theme-one-dark'; // npm install @codemirror/theme-one-dark

// --- オプション: Vim/Emacs キーマップ ---
// import { vim } from '@replit/codemirror-vim'; // npm install @replit/codemirror-vim
// import { emacs } from '@codemirror/emacs'; // npm install @codemirror/emacs (コミュニティ製)

// --- 長行のハイライト ---
// 特定の行の背景色を変更するシンプルなカスタム拡張
const showLongLines = EditorState.transactionExtender.of(tr => {
    let effects = [];
    if (tr.docChanged) {
        tr.startState.doc.iterLines(line => {
            if (line.length > 80) { // 例: 80文字を超える行をハイライト
                // 行全体にスタイルを適用するMarkを適用する例。
                // 実際のCodeMirror 6ではもう少し複雑なRangeSetの操作が必要です。
                // ここでは概念的な表現としています。
                // より高度な行ハイライトはLineDecorationなどを使います。
            }
        });
    }
    return effects.length ? { effects } : null;
});

class SourceTab extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleCodeChange',
            'initializeEditor',
            'handleRunCode', // 実行ボタンのハンドラ
            'handleSaveCode' // 保存ボタンのハンドラ
        ]);
        this.editorRef = React.createRef();
        this.editorView = null; // CodeMirror EditorView インスタンスを保持

        this.state = {
            spriteCode: this.initializeSpriteCode(props.sprites, props.stage),
            selectedSpriteId: props.editingTarget
        };
    }

    componentDidMount() {
        this.initializeEditor();
    }

    componentDidUpdate(prevProps) {
        // 編集対象のスプライトが変更された場合
        if (prevProps.editingTarget !== this.props.editingTarget) {
            this.setState({ selectedSpriteId: this.props.editingTarget }, () => {
                if (this.editorView) {
                    const newCode = this.state.spriteCode[this.props.editingTarget] || '';
                    this.editorView.dispatch({
                        changes: {
                            from: 0,
                            to: this.editorView.state.doc.length,
                            insert: newCode
                        },
                        selection: { anchor: 0 } // カーソルを先頭にリセット
                    });
                }
            });
        }
    }

    componentWillUnmount() {
        if (this.editorView) {
            this.editorView.destroy(); // EditorView の破棄
        }
    }

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

    initializeEditor() {
        const initialCode = this.state.spriteCode[this.state.selectedSpriteId] || '';

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

        const startState = EditorState.create({
            doc: initialCode,
            extensions: [
                // --- 基本的なセットアップ ---
                lineNumbers(), // 行番号
                highlightActiveLineGutter(), // アクティブな行のガッターをハイライト
                highlightSpecialChars(), // 特殊文字のハイライト
                history(), // 変更履歴 (Undo/Redo)
                foldGutter(), // コードの折りたたみガッター
                drawSelection(), // 選択範囲の描画
                EditorState.allowMultipleSelections.of(true), // 複数選択を許可
                indentOnInput(), // 入力時の自動インデント
                bracketMatching(), // 括弧のマッチング
                closeBrackets(), // 括弧の自動閉じ
                autocompletion(), // 自動補完
                rectangularSelection(), // 矩形選択
                highlightActiveLine(), // アクティブな行のハイライト
                highlightSelectionMatches(), // 選択範囲と一致する単語をハイライト

                // --- 言語固有の機能 ---
                javascript(), // JavaScript 言語サポート

                // --- リンティング (静的解析) ---
                myLinter, // カスタムリンターの適用

                // --- キーマップ ---
                // 注意: defaultKeymap に多くのコマンドが含まれているため、
                // 重複するキーバインドに注意が必要です。
                keymap.of([
                    ...defaultKeymap, // コアなエディター操作
                    ...searchKeymap, // 検索・置換
                    ...historyKeymap, // Undo/Redo
                    ...foldKeymap, // コードの折りたたみ
                    ...commentKeymap, // コメントアウト
                    ...completionKeymap, // 自動補完
                    ...closeBracketsKeymap, // 括弧の自動閉じ
                    ...lintKeymap, // Linting (F8 で次の警告へ移動など)

                    // --- オプション: Vim/Emacs キーマップ ---
                    // vim, // Vim キーマップを有効にする場合はコメント解除
                    // emacs // Emacs キーマップを有効にする場合はコメント解除
                ]),

                // --- カスタム拡張機能 ---
                // 長行のハイライト (概念的な例、実際のスタイル適用は別途実装が必要)
                // showLongLines,

                // --- コード変更イベントリスナー ---
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        this.handleCodeChange(update.state.doc.toString());
                    }
                })
            ]
        });

        this.editorView = new EditorView({
            state: startState,
            parent: this.editorRef.current // エディターをレンダリングするDOM要素
        });
    }

    handleCodeChange(newCode) {
        const { selectedSpriteId, spriteCode } = this.state;

        this.setState({
            spriteCode: {
                ...spriteCode,
                [selectedSpriteId]: newCode
            }
        });
        // ここで、必要に応じてコードの実行や保存のトリガーを検討
    }

    handleRunCode = () => {
        const { vm } = this.props;
        const { selectedSpriteId, spriteCode } = this.state;
        const codeToRun = spriteCode[selectedSpriteId] || '';

        if (!codeToRun) {
            console.warn('No code to run for the selected sprite.');
            return;
        }

        try {
            // ★ ここにセキュリティサンドボックスを実装すること！ ★
            // eval や new Function は開発用のみに限定し、本番環境では絶対に直接使用しないでください。
            // Web Worker, iframe sandbox, または独自のインタプリタ/トランスパイラが必要です。

            // 例: 簡略化された実行（危険なため、概念のみ）
            // ユーザーコードに Scratch VM の API を注入する例
            const target = vm.runtime.getTargetById(selectedSpriteId);
            if (target) {
                // Scratch のスプライトAPIを模倣したオブジェクト
                const Scratch = {
                    move: (steps) => {
                        // Scratch VM のブロックのロジックを直接呼び出すか、
                        // VM の内部状態を操作するカスタムAPIを呼び出す
                        // 例: target.setX(target.x + steps); (実際はもっと複雑)
                        vm.runtime.requestAddBlock({
                            opcode: 'motion_movesteps',
                            fields: { STEPS: steps },
                            targetId: selectedSpriteId
                        });
                        vm.runtime.sequencer.step(); // VM の実行ステップを進める (簡易的な例)
                    },
                    say: (message) => {
                        // 例えば、スプライトの吹き出しを更新する
                        console.log(`Sprite ${target.name} says: ${message}`);
                        // VM の表示レポート関数を呼び出すなど
                        // vm.displayReporter('say', message);
                    },
                    // 他にも、setX, setY, changeX, changeY, turn, glide, wait など
                    // Scratch のブロックに対応する関数をここに定義
                    setX: (x) => target.setXY(x, target.y),
                    setY: (y) => target.setXY(target.x, y),
                    changeX: (dx) => target.setXY(target.x + dx, target.y),
                    changeY: (dy) => target.setXY(target.x, target.y + dy),
                    turnRight: (degrees) => target.setDirection(target.direction + degrees),
                    turnLeft: (degrees) => target.setDirection(target.direction - degrees),
                    // 変数アクセスなども必要に応じて
                    getVar: (name) => target.lookupVariableByNameAndType(name).value,
                    setVar: (name, value) => {
                        const variable = target.lookupVariableByNameAndType(name);
                        if (variable) variable.value = value;
                    }
                };

                // new Function でコードを実行し、Scratch API を注入
                // THIS IS DANGEROUS IN PRODUCTION WITHOUT SANDBOXING
                const scriptFunction = new Function('Scratch', codeToRun);
                scriptFunction(Scratch);

            } else {
                console.error('Selected target not found in VM:', selectedSpriteId);
            }
            console.log('Code execution attempt dispatched!');
            // 実行後、必要に応じてVMを再起動したり、ステージをリフレッシュしたりする
            // this.props.vm.greenFlag(); // 例: 全てのリセットと実行

        } catch (error) {
            console.error('Error executing code:', error);
            // ユーザーにエラーメッセージを表示するUIを追加する
        }
    };

    handleSaveCode = () => {
        // 現在のエディターのコードを取得
        const codeToSave = this.editorView.state.doc.toString();
        console.log('Saving code for sprite:', this.state.selectedSpriteId, codeToSave);
        // ここにコードを保存するロジックを実装
        // 例: Reduxストアにディスパッチしてプロジェクトデータに組み込む
    };

    render() {
        if (!this.props.vm || !this.props.vm.editingTarget) {
            return null;
        }

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
                    {/* その他のツールバーボタン */}
                </div>
                {/* エディター本体 */}
                <div className={styles.editorContainer}>
                    <div ref={this.editorRef} style={{ height: '100%', width: '100%' }} />
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