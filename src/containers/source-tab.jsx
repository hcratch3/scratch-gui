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
  copySelected, cutSelected
} from "@codemirror/commands";
import {
  searchKeymap, highlightSelectionMatches, startSearch
} from "@codemirror/search";
import {
  autocompletion, completionKeymap, closeBrackets,
  closeBracketsKeymap
} from "@codemirror/autocomplete";
import {lintKeymap} from "@codemirror/lint";

import { javascript } from "@codemirror/lang-javascript";
// テーマのインポートは削除済み

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// リファクタリング: 外部ファイルからデコンパイラと補完リストをインポート
import decompileBlockToJs from '../lib/decompiler/decompileBlockToJs'; // ★パスは実際の配置に合わせる
import defaultCompletions from '../lib/autocompletion/defaultCompletions'; // ★パスは実際の配置に合わせる


const SourceTab = (props) => {
    const editorRef = useRef(null);
    const editorInstance = useRef(null);

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
    
    // カスタムメッセージボックスの状態
    const [messageBoxVisible, setMessageBoxVisible] = useState(false);
    const [messageBoxContent, setMessageBoxContent] = useState('');

    const showMessageBox = useCallback((message) => {
        setMessageBoxContent(message);
        setMessageBoxVisible(true);
    }, []);

    const hideMessageBox = useCallback(() => {
        setMessageBoxVisible(false);
        setMessageBoxContent('');
    }, []);


    // Scratchブロックに対応するカスタム補完項目を定義 (外部ファイルからインポート)
    const scratchCompletions = useCallback((context) => {
        const word = context.matchBefore(/\w*/);
        if (!word.from || word.from === word.to && !context.explicit) {
            return null;
        }

        const filteredCompletions = defaultCompletions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase())
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, []);


    // エディタの初期化とクリーンアップ
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                return;
            }

            const initialDoc = ''; 
            const extensions = [
                lineNumbers(),
                foldGutter(),
                highlightSpecialChars(),
                history(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                indentOnInput(),
                syntaxHighlighting(defaultHighlightStyle),
                bracketMatching(),
                closeBrackets(),
                autocompletion({ override: [scratchCompletions] }),
                rectangularSelection(),
                crosshairCursor(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                highlightSelectionMatches(),
                javascript(), // JavaScriptシンタックスハイライトを使用
                EditorView.lineWrapping,
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                    ...completionKeymap,
                    ...lintKeymap
                ]),
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
            console.log("CodeMirror 6 Multi-feature editor initialized.");
        };

        if (!editorInstance.current) {
            initializeEditor();
        }

        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 editor destroyed.");
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

    // selectedSpriteId の変更を監視 (propsからstateへの同期) (変更なし)
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // Scratch 3.0ブロックをJavaScript風コードに「変換」して表示するロジック (デコンパイラ・フェーズ1)
    useEffect(() => {
        if (!props.vm || !selectedSpriteId) {
            return;
        }

        try {
            const target = props.vm.runtime.getTargetById(selectedSpriteId);
            if (target && target.blocks) {
                const blocksMap = target.blocks._blocks; 
                
                let allBlocks = [];
                if (blocksMap instanceof Map) {
                    allBlocks = Array.from(blocksMap.values());
                } else if (typeof blocksMap === 'object' && blocksMap !== null) {
                    allBlocks = Object.values(blocksMap);
                } else {
                    console.warn("blocksMapはMapでもプレーンなオブジェクトでもありません:", blocksMap);
                    const errorMessage = `// エラー: ブロックデータが予期せぬ形式です。\n// 詳細: blocksMapがMapでもオブジェクトでもありません。\n// コンソールを確認してください。`;
                    if (editorInstance.current) {
                        editorInstance.current.dispatch({
                            changes: {
                                from: 0,
                                to: editorInstance.current.state.doc.length,
                                insert: errorMessage
                            },
                        });
                    }
                    setSpriteCode(prevCodeMap => ({
                        ...prevCodeMap,
                        [selectedSpriteId]: errorMessage
                    }));
                    return;
                }

                let generatedCode = '';
                const topLevelBlocks = allBlocks.filter(
                    block => block.topLevel && !block.parent
                );

                topLevelBlocks.forEach(block => {
                    generatedCode += decompileBlockToJs(blocksMap, block.id, 0) + '\n';
                });

                if (generatedCode.trim() === '') {
                    generatedCode = '// スクリプトがありません。ブロックを追加してください。';
                }

                if (editorInstance.current) {
                    const currentEditorDoc = editorInstance.current.state.doc.toString();
                    if (currentEditorDoc !== generatedCode) {
                        editorInstance.current.dispatch({
                            changes: {
                                from: 0,
                                to: currentEditorDoc.length,
                                insert: generatedCode
                            },
                        });
                        console.log(`Scratch 3.0のブロックをJavaScript風コードにデコンパイルしました。`);
                    }
                }
                setSpriteCode(prevCodeMap => ({
                    ...prevCodeMap,
                    [selectedSpriteId]: generatedCode
                }));

            }
        } catch (error) {
            console.error('ブロックデータのデコンパイル中にエラーが発生しました:', error);
            const errorMessage = `// エラー: ブロックデータのデコンパイルに失敗しました。\n// 詳細: ${error.message}\n// デコンパイラに未対応のブロックが含まれている可能性があります。`;
            if (editorInstance.current) {
                editorInstance.current.dispatch({
                    changes: {
                        from: 0,
                        to: editorInstance.current.state.doc.length,
                        insert: errorMessage
                    },
                });
            }
            setSpriteCode(prevCodeMap => ({
                ...prevCodeMap,
                [selectedSpriteId]: errorMessage
            }));
        }
    }, [selectedSpriteId, props.vm]);

    // selectedSpriteId または spriteCode が変更されたときにエディタの内容を更新 (今回はデコンパイラからの自動更新を優先)
    useEffect(() => {
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }
        // ここはデコンパイラのuseEffectがCodeMirrorのコンテンツを更新するため、
        // ユーザーが手動でCodeMirrorを編集した際のhandleCodeChangeとは別に動作します。
        // デコンパイラのロジックが優先されるため、ここでは特別な処理は不要です。
        // もしユーザーの手動編集を保持したい場合は、より複雑な同期ロジックが必要です。
    }, [selectedSpriteId, spriteCode]);

    // props.sprites または props.stage の変更を監視し、spriteCode を更新 (変更なし)
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
            console.log("Sprite list changed. Code map updated.");
        }
    }, [props.sprites, props.stage, spriteCode]);

    // Toolbar action handlers
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

    // コピー機能
    const handleCopy = useCallback(() => {
        if (editorInstance.current) {
            const editorView = editorInstance.current;
            const selection = editorView.state.selection.main;
            const selectedText = editorView.state.doc.sliceString(selection.from, selection.to);

            if (selectedText.length > 0) {
                const tempTextArea = document.createElement('textarea');
                tempTextArea.value = selectedText;
                document.body.appendChild(tempTextArea);
                tempTextArea.select();
                try {
                    document.execCommand('copy');
                    showMessageBox('選択されたテキストをコピーしました。');
                } catch (err) {
                    console.error('コピーに失敗しました:', err);
                    showMessageBox('コピーに失敗しました。ブラウザのセキュリティ設定を確認してください。');
                } finally {
                    document.body.removeChild(tempTextArea);
                }
            } else {
                showMessageBox('コピーするテキストが選択されていません。');
            }
        }
    }, [showMessageBox]);

    // カット機能
    const handleCut = useCallback(() => {
        if (editorInstance.current) {
            const editorView = editorInstance.current;
            const selection = editorView.state.selection.main;
            const selectedText = editorView.state.doc.sliceString(selection.from, selection.to);

            if (selectedText.length > 0) {
                const tempTextArea = document.createElement('textarea');
                tempTextArea.value = selectedText;
                document.body.appendChild(tempTextArea);
                tempTextArea.select();
                let copiedSuccessfully = false;
                try {
                    copiedSuccessfully = document.execCommand('copy');
                } catch (err) {
                    console.error('カット（コピー部分）に失敗しました:', err);
                } finally {
                    document.body.removeChild(tempTextArea);
                }

                if (copiedSuccessfully) {
                    editorView.dispatch({
                        changes: {
                            from: selection.from,
                            to: selection.to,
                            insert: ''
                        }
                    });
                    showMessageBox('選択されたテキストをカットしました。');
                } else {
                    showMessageBox('カット（コピー部分）に失敗しました。');
                }
            } else {
                showMessageBox('カットするテキストが選択されていません。');
            }
        }
    }, [showMessageBox]);

    // ペースト機能
    const handlePaste = useCallback(async () => {
        if (editorInstance.current) {
            const editorView = editorInstance.current;
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const changes = editorView.state.changeByRange(range => ({
                        changes: { from: range.from, to: range.to, insert: text },
                        range: { from: range.from + text.length, to: range.from + text.length }
                    }));
                    editorView.dispatch(changes);
                    showMessageBox('テキストをペーストしました。');
                } else {
                    showMessageBox('クリップボードにテキストがありません。');
                }
            } catch (err) {
                console.error('ペーストに失敗しました:', err);
                showMessageBox('ペーストに失敗しました。クリップボードへのアクセスが許可されているか確認してください。');
            }
        }
    }, [showMessageBox]);

    // 新規追加: 削除機能
    const handleDelete = useCallback(() => {
        if (editorInstance.current) {
            const editorView = editorInstance.current;
            const selection = editorView.state.selection.main;

            if (!selection.empty) { // 選択範囲がある場合
                editorView.dispatch({
                    changes: {
                        from: selection.from,
                        to: selection.to,
                        insert: ''
                    }
                });
                showMessageBox('選択されたテキストを削除しました。');
            } else { // 選択範囲がない場合、すべてのテキストを削除
                editorView.dispatch({
                    changes: {
                        from: 0,
                        to: editorView.state.doc.length,
                        insert: ''
                    }
                });
                showMessageBox('エディタのすべてのコンテンツを削除しました。');
            }
        }
    }, [showMessageBox]);

    // 新規追加: チェック機能 (現時点ではデモンストレーション)
    const handleCheck = useCallback(() => {
        if (editorInstance.current) {
            const currentCode = editorInstance.current.state.doc.toString();
            console.log("--- コードのチェックを実行中 ---");
            console.log("チェック対象コード:\n", currentCode);
            // ここに実際のコード解析（例: リンティング、簡易構文チェック）ロジックを実装します。
            // 現時点では、単純なメッセージを表示します。
            showMessageBox('コードのチェックを実行しました。詳細はコンソールを確認してください。');
            console.log("----------------------------");
        }
    }, [showMessageBox]);


    const handleSearch = useCallback(() => {
        if (editorInstance.current) {
            startSearch(editorInstance.current);
        }
    }, []);

    const handleRunCompiledCode = useCallback(() => {
        if (editorInstance.current) {
            const currentCode = editorInstance.current.state.doc.toString();
            console.log("--- コンパイルされたJavaScriptコードの実行を試みます ---");
            console.log(currentCode);
            console.log("-------------------------------------------------");
            console.log("注意: このコードはブラウザのJavaScriptエンジンで実行されますが、");
            console.log("直接Scratch VMのスプライトやステージを操作するものではありません。");
            console.log("VMを操作するには、コンパイルされたJSとVMのAPIを橋渡しする");
            console.log("カスタムのバインディング層と安全な実行環境が必要です。");

            try {
                // new Function(currentCode)(); // セキュリティリスクに注意
            } catch (e) {
                console.error("JavaScriptコードの実行中にエラーが発生しました:", e);
            }
        }
    }, []);

    // コードをブロックに変換するハンドラ (限定的なデモンストレーション)
    const handleCompileToBlocks = useCallback(() => {
        if (editorInstance.current && props.vm) {
            const currentCode = editorInstance.current.state.doc.toString();
            try {
                const projectJSON = JSON.parse(currentCode);

                props.vm.loadProject(projectJSON)
                    .then(() => {
                        console.log("コードをScratchプロジェクトとしてVMにロードしました。");
                    })
                    .catch(e => {
                        console.error("Scratchプロジェクトのロードに失敗しました:", e);
                        showMessageBox(`プロジェクトのロードに失敗しました。\nエラー: ${e.message}\nエディタの内容が有効なScratchプロジェクトJSONであることを確認してください。`);
                    });

            } catch (e) {
                console.error("CodeMirrorの内容が有効なJSONではありません:", e);
                showMessageBox(`コードをブロックに変換できませんでした。\nエラー: ${e.message}\n有効なJSON形式のScratchプロジェクトデータが入力されているか確認してください。`);
            }
        }
    }, [props.vm, showMessageBox]);


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
            {/* Tailwindクラスを削除し、styles.buttonGroupを使用 */}
            <div className={styles.buttonGroup}>
                <button
                    className={styles.button} // styles.button クラスを使用
                    onClick={handleSearch}
                    title="検索 (Ctrl+F)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    検索
                </button>
                <button
                    className={styles.button}
                    onClick={handleCopy}
                    title="コピー (Ctrl+C)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    コピー
                </button>
                <button
                    className={styles.button}
                    onClick={handleCut}
                    title="カット (Ctrl+X)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"></circle><path d="M8.12 8.12 12 12"></path><path d="M20 4 8.12 15.88"></path><circle cx="6" cy="18" r="3"></circle><path d="M14.8 14.8 20 20"></path></svg>
                    カット
                </button>
                <button
                    className={styles.button}
                    onClick={handlePaste}
                    title="ペースト (Ctrl+V / Cmd+V)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                    ペースト
                </button>
                <button
                    className={styles.button}
                    onClick={handleDelete} // 新しい削除ハンドラ
                    title="削除 (選択範囲を削除、または全削除)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 16 7 16h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="10" y1="9" x2="18" y2="17"></line><line x1="18" y1="9" x2="10" y2="17"></line></svg>
                    削除
                </button>
                <button
                    className={styles.button}
                    onClick={handleUndo}
                    // disabled={!props.canUndo} // このpropsは現在定義されていないため削除
                    title="戻る (Ctrl+Z)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V6l3 3"></path><path d="M12 6l-3 3"></path></svg>
                    戻る
                </button>
                <button
                    className={styles.button}
                    onClick={handleRedo}
                    // disabled={!props.canRedo} // このpropsは現在定義されていないため削除
                    title="進む (Ctrl+Shift+Z)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v13l-3-3"></path><path d="M12 18l3-3"></path></svg>
                    進む
                </button>
                <button
                    className={`${styles.button} ${styles.runButton}`}
                    onClick={handleRunCompiledCode}
                    title="コードを実行 (コンソールに出力)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    コードを実行
                </button>
                <button
                    className={`${styles.button} ${styles.compileButton}`}
                    onClick={handleCompileToBlocks}
                    title="コードをブロックに変換 (ScratchプロジェクトJSONとしてロード)"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                    ブロックに変換
                </button>
                 <button
                    className={styles.button}
                    onClick={handleCheck} // 新しいチェックハンドラ
                    title="コードをチェック"
                >
                    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    チェック
                </button>
            </div>

            {/* CodeMirrorエディタをマウントする場所 */}
            <div style={{ height: 'calc(100% - 50px)', width: '100%' }} className={styles.editorContainer}>
                <div ref={editorRef} className={styles.codemirrorContainer} />
            </div>

            {/* カスタムメッセージボックス */}
            {messageBoxVisible && (
                <div className={styles.messageBoxOverlay}>
                    <div className={styles.messageBox}>
                        <p className={styles.messageBoxContent}>{messageBoxContent}</p>
                        <button
                            onClick={hideMessageBox}
                            className={styles.messageBoxButton}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

SourceTab.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.object.isRequired,
    stage: PropTypes.object,
    setRef: PropTypes.func,
    onContainerClick: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired,
};

const mapStateToProps = (state) => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    vm: state.scratchGui.vm,
});

export default errorBoundaryHOC('Source Tab')(
    connect(mapStateToProps)(SourceTab)
);
