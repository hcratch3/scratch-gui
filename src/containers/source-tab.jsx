import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

// CodeMirror 6のモジュールを直接インポート
import { Extension, EditorState } from "@codemirror/state";
import {
  EditorView, keymap, highlightSpecialChars, drawSelection,
  highlightActiveLine, dropCursor, rectangularSelection,
  crosshairCursor, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view";
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching, foldGutter, foldKeymap
} from "@codemirror/language";
import {
  defaultKeymap, history, historyKeymap, undo, redo,
  copySelected, cutSelected // コピー、カットコマンドを追加
} from "@codemirror/commands";
import {
  searchKeymap, highlightSelectionMatches, startSearch // 検索コマンドを追加
} from "@codemirror/search";
import {
  autocompletion, completionKeymap, closeBrackets,
  closeBracketsKeymap
} from "@codemirror/autocomplete";
import {lintKeymap} from "@codemirror/lint";

import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

import styles from '../components/source/source.css'; // 既存のスタイルシート
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

const SourceTab = (props) => {
    const editorRef = useRef(null); // エディタをマウントするDOM要素への参照
    const editorInstance = useRef(null); // CodeMirrorエディタインスタンスへの参照

    const [spriteCode, setSpriteCode] = useState(() => {
        const codeMap = {};
        Object.keys(props.sprites).forEach((spriteId) => {
            codeMap[spriteId] = '';
        });
        if (props.stage) {
            codeMap[props.stage.id] = '';
        }
        return codeMap;
    });

    const [selectedSpriteId, setSelectedSpriteId] = useState(props.editingTarget);

    // カスタムコマンドを保存するステート
    const [customCommands, setCustomCommands] = useState([]);

    // `command.json` からカスタムコマンドをロードするuseEffect
    useEffect(() => {
        const loadCustomCommands = async () => {
            try {
                const response = await fetch('../components/source/command.json');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                // データの形式がCodeMirrorの補完形式に合うように変換
                const formattedCommands = data.commands.map(cmd => ({
                    label: cmd.label,
                    type: cmd.type || "keyword", // デフォルトはkeyword
                    info: cmd.info || ""
                }));
                setCustomCommands(formattedCommands);
                console.log('カスタムコマンドをロードしました:', formattedCommands);
            } catch (error) {
                console.error('カスタムコマンドのロードに失敗しました:', error);
                // エラー時は空の配列を設定し、アプリケーションの動作を継続
                setCustomCommands([]);
            }
        };

        loadCustomCommands();
    }, []); // コンポーネントマウント時に一度だけ実行

    // Scratchブロックに対応するカスタム補完項目を定義 (再利用)
    const scratchCompletions = useCallback((context) => {
        const word = context.matchBefore(/\w*/);
        if (!word.from || word.from === word.to && !context.explicit) {
            return null;
        }

        // カスタムコマンドとデフォルトコマンドを結合
        const allCompletions = [...customCommands];

        const filteredCompletions = allCompletions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase())
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, [customCommands]); // customCommands が更新されたらscratchCompletionsも再生成


    // エディタの初期化とクリーンアップ (コンポーネントマウント時に一度だけ実行)
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                return;
            }

            // エディタの初期コンテンツは空文字列にする (後続のuseEffectで実際のコードをセット)
            const initialDoc = ''; 

            // 提示された多機能な拡張機能を統合
            const extensions = [
                // 基本的なCodeMirrorの機能
                lineNumbers(), // 行番号
                foldGutter(), // コード折りたたみ
                highlightSpecialChars(), // 特殊文字のハイライト
                history(), // 履歴
                drawSelection(), // 独自の選択描画
                dropCursor(), // ドロップカーソル
                EditorState.allowMultipleSelections.of(true), // 複数選択を許可
                indentOnInput(), // 入力時のインデント
                syntaxHighlighting(defaultHighlightStyle), // デフォルトのシンタックスハイライト
                bracketMatching(), // ブラケットマッチング
                closeBrackets(), // ブラケットの自動閉じ
                autocompletion({ override: [scratchCompletions] }), // 自動補完とカスタム補完
                rectangularSelection(), // 長方形選択
                crosshairCursor(), // クロスヘアカーソル
                highlightActiveLine(), // アクティブな行のハイライト
                highlightActiveLineGutter(), // アクティブな行のガターハイライト
                highlightSelectionMatches(), // 選択範囲のマッチをハイライト
                javascript(), // JavaScript言語サポート
                oneDark, // ダークテーマ
                EditorView.lineWrapping, // 行の折り返し

                // キーマップの統合
                keymap.of([
                    ...closeBracketsKeymap, // ブラケット閉じ関連キーマップ
                    ...defaultKeymap, // デフォルトのキーマップ
                    ...searchKeymap, // 検索関連キーマップ
                    ...historyKeymap, // 履歴関連キーマップ
                    ...foldKeymap, // コード折りたたみ関連キーマップ
                    ...completionKeymap, // 自動補完関連キーマップ
                    ...lintKeymap // リンター関連キーマップ
                ]),

                // エディタの変更を監視するリスナー
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        handleCodeChange(update.state.doc.toString());
                    }
                })
            ];

            const startState = EditorState.create({
                doc: initialDoc,
                extensions: extensions
            });

            const view = new EditorView({
                state: startState,
                parent: editorRef.current
            });

            editorInstance.current = view;
            console.log("CodeMirror 6 多機能エディターが初期化されました。");
        };

        if (!editorInstance.current) {
            initializeEditor();
        }

        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 エディターを破棄します。");
                editorInstance.current.destroy();
                editorInstance.current = null;
            }
        };
    }, [scratchCompletions]);

    const handleCodeChange = useCallback((newCode) => {
        setSpriteCode(prevCodeMap => ({
            ...prevCodeMap,
            [selectedSpriteId]: newCode
        }));
    }, [selectedSpriteId]);

    // selectedSpriteId の変更を監視 (propsからstateへの同期)
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // selectedSpriteId または spriteCode が変更されたときにエディタの内容を更新
    useEffect(() => {
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }

        const newCode = spriteCode[selectedSpriteId] || '';
        if (editorInstance.current.state.doc.toString() !== newCode) {
            editorInstance.current.dispatch({
                changes: {
                    from: 0,
                    to: editorInstance.current.state.doc.length,
                    insert: newCode
                },
            });
            console.log(`エディタの内容をスプライトID ${selectedSpriteId} のコードで更新しました。`);
        }
    }, [selectedSpriteId, spriteCode]);

    // props.sprites または props.stage の変更を監視し、spriteCode を更新
    useEffect(() => {
        const newCodeMap = {};
        let changed = false;

        Object.keys(props.sprites).forEach((spriteId) => {
            if (!(spriteId in spriteCode)) {
                changed = true;
            }
            newCodeMap[spriteId] = spriteCode[spriteId] || '';
        });
        if (props.stage) {
            if (!(props.stage.id in spriteCode)) {
                changed = true;
            }
            newCodeMap[props.stage.id] = spriteCode[props.stage.id] || '';
        }

        for (const id in spriteCode) {
            if (!(id in newCodeMap)) {
                delete spriteCode[id];
                changed = true;
            }
        }

        if (changed || Object.keys(newCodeMap).length !== Object.keys(spriteCode).length) {
            setSpriteCode(newCodeMap);
            console.log("スプライトリストが変更されました。コードマップを更新しました。");
        }
    }, [props.sprites, props.stage, spriteCode]);

    // ツールバーのアクションハンドラ
    const handleUndo = useCallback(() => {
        if (editorInstance.current) {
            undo(editorInstance.current);
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (editorInstance.current) {
            redo(editorInstance.current);
        }
    }, []);

    const handleCopy = useCallback(() => {
        if (editorInstance.current) {
            copySelected(editorInstance.current);
        }
    }, []);

    const handleCut = useCallback(() => {
        if (editorInstance.current) {
            cutSelected(editorInstance.current);
        }
    }, []);

    const handlePaste = useCallback(() => {
        // 注: ブラウザのセキュリティ制約により、プログラムからクリップボードに直接アクセスして
        // ペーストを行うことは困難です。ユーザーにCtrl+V / Cmd+Vの使用を促すのが一般的です。
        // ここでは便宜上、アラートを出力します。
        // より高度な実装には、クリップボードAPI (navigator.clipboard.readText()) の使用を検討しますが、
        // ユーザーの許可が必要です。
        console.warn("ペースト機能はブラウザのセキュリティ制約により、ボタンから直接実行できません。キーボードショートカット (Ctrl+V / Cmd+V) を使用してください。");
        // 例: ユーザーにメッセージボックスを表示することも可能
        // alert("Ctrl+V または Cmd+V を使用してペーストしてください。");
    }, []);

    const handleSearch = useCallback(() => {
        if (editorInstance.current) {
            startSearch(editorInstance.current);
        }
    }, []);


    if (!props.vm.editingTarget) {
        return null;
    }

    return (
        <div
            className={styles.source}
            ref={props.setRef}
            onMouseDown={props.onContainerClick}
        >
            {/* ツールバーコンテナ */}
            <div className="flex justify-center p-3 space-x-2 bg-gray-700 rounded-t-lg shadow-md">
                <button
                    onClick={handleSearch}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="検索 (Ctrl+F)"
                >
                    検索
                </button>
                <button
                    onClick={handleCopy}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="コピー (Ctrl+C)"
                >
                    コピー
                </button>
                <button
                    onClick={handleCut}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="カット (Ctrl+X)"
                >
                    カット
                </button>
                <button
                    onClick={handlePaste}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="ペースト (Ctrl+V / Cmd+V)"
                >
                    ペースト
                </button>
                <button
                    onClick={handleUndo}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="戻る (Ctrl+Z)"
                >
                    戻る
                </button>
                <button
                    onClick={handleRedo}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="進む (Ctrl+Shift+Z)"
                >
                    進む
                </button>
            </div>

            {/* CodeMirrorエディタをマウントする場所 */}
            <div style={{ height: 'calc(100% - 50px)', width: '100%' }} className="rounded-b-lg overflow-hidden">
                <div ref={editorRef} className="codemirror-container w-full h-full" />
            </div>
        </div>
    );
};

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
