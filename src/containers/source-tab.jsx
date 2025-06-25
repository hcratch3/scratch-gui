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


    // エディタの初期化とクリーンアップ (変更なし)
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

    // Toolbar action handlers (変更なし)
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
        console.warn("ペースト機能はブラウザのセキュリティ制約により、ボタンから直接実行できません。キーボードショートカット (Ctrl+V / Cmd+V) を使用してください。");
    }, []);

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

    // コードをブロックに変換するハンドラ (限定的なデモンストレーション) (変更なし)
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
                        alert(`プロジェクトのロードに失敗しました。\nエラー: ${e.message}\nエディタの内容が有効なScratchプロジェクトJSONであることを確認してください。`);
                    });

            } catch (e) {
                console.error("CodeMirrorの内容が有効なJSONではありません:", e);
                alert(`コードをブロックに変換できませんでした。\nエラー: ${e.message}\n有効なJSON形式のScratchプロジェクトデータが入力されているか確認してください。`);
            }
        }
    }, [props.vm]);


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
                <button
                    onClick={handleRunCompiledCode}
                    className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-md shadow-sm transition-colors duration-200 ml-4"
                    title="コンパイルされたコードを実行 (コンソールに出力)"
                >
                    コードを実行
                </button>
                {/* 新規追加: コードをブロックに変換するボタン */}
                <button
                    onClick={handleCompileToBlocks}
                    className="p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="コードをブロックに変換 (ScratchプロジェクトJSONとしてロード)"
                >
                    ブロックに変換
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
