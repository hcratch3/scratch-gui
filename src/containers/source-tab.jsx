import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

// CodeMirror 6のモジュールを直接インポート
// Webpackで適切にバンドルされることを想定しています
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
// basicSetup は codemirror パッケージに統合されている場合もありますが、
// CDN版のように個別の拡張機能の組み合わせで対応する方が柔軟です。
// 必要に応じて他の @codemirror/xxx 拡張機能をインポートしてください。
import { history, undo, redo } from '@codemirror/commands'; // 履歴機能
import { bracketMatching } from '@codemirror/language'; // ブラケットマッチング

import styles from '../components/source/source.css'; // 既存のスタイルシート
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// CodeMirror 6のCSSを直接インポート（Webpackが処理する）
// これにより、動的な<link>タグの追加は不要になります
import '@codemirror/theme-one-dark/dist/index.css';
// CodeMirrorの基本的なビューのスタイルは、
// @codemirror/view/dist/editor.css のような形で提供されることがありますが、
// CodeMirror 6はデフォルトでCSSをあまり持たず、テーマに任せる傾向があります。
// 必要に応じて追加してください。

const SourceTab = (props) => {
    const editorRef = useRef(null); // エディタをマウントするDOM要素への参照
    const editorInstance = useRef(null); // CodeMirrorエディタインスタンスへの参照

    const [spriteCode, setSpriteCode] = useState(() => {
        // 初期化時にスプライトのコードマップを作成
        const codeMap = {};
        Object.keys(props.sprites).forEach((spriteId) => {
            codeMap[spriteId] = '';
        });
        if (props.stage) {
            codeMap[props.stage.id] = '';
        }
        return codeMap;
    });

    // 現在選択されているスプライトのIDを状態として保持
    const [selectedSpriteId, setSelectedSpriteId] = useState(props.editingTarget);

    // エディタの初期化とクリーンアップ
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                // エディタをマウントする要素がない場合は何もしない
                return;
            }

            // エディタの初期コンテンツ
            const initialDoc = spriteCode[selectedSpriteId] || '';

            // エディタの拡張機能の定義
            const extensions = [
                lineNumbers(),          // 行番号
                history(),              // 履歴
                bracketMatching(),      // ブラケットマッチング
                highlightActiveLine(),  // アクティブな行のハイライト
                javascript(),           // JavaScript言語サポート
                keymap.of([
                    indentWithTab,      // Tabキーでのインデント
                    // その他のキーマップ（例: Ctrl+Zでundo, Ctrl+Shift+Zでredo）
                    { key: "Mod-z", run: undo },
                    { key: "Mod-Shift-z", run: redo }
                ]),
                oneDark, // ダークテーマ
                EditorView.lineWrapping, // 行の折り返し
                EditorView.updateListener.of((update) => {
                    // エディタの内容が変更されたときのコールバック
                    if (update.docChanged) {
                        handleCodeChange(update.state.doc.toString());
                    }
                })
            ];

            // エディタの状態を作成
            const startState = EditorState.create({
                doc: initialDoc,
                extensions: extensions
            });

            // エディタのビューを作成し、DOM要素にマウント
            const view = new EditorView({
                state: startState,
                parent: editorRef.current
            });

            // editorInstance refにエディタインスタンスを保存
            editorInstance.current = view;

            console.log("CodeMirror 6 エディターが初期化されました。");
        };

        // editorInstance.current が null の場合のみ初期化を実行
        // これにより、コンポーネントが再レンダリングされてもエディタが再初期化されるのを防ぐ
        if (!editorInstance.current) {
            initializeEditor();
        }


        // クリーンアップ関数: コンポーネントがアンマウントされるときにエディタを破棄
        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 エディターを破棄します。");
                editorInstance.current.destroy();
                editorInstance.current = null;
            }
        };
    }, []); // 依存配列が空なので、コンポーネントマウント時に一度だけ実行

    // コード変更ハンドラをuseCallbackでメモ化
    const handleCodeChange = useCallback((newCode) => {
        setSpriteCode(prevCodeMap => ({
            ...prevCodeMap,
            [selectedSpriteId]: newCode
        }));
    }, [selectedSpriteId]); // selectedSpriteIdが変わったら再生成

    // props.editingTarget が変更されたときの処理
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // selectedSpriteId または spriteCode が変更され、かつエディタがロード済みの場合
    useEffect(() => {
        // editorInstance.current が null の場合（まだ初期化されていない場合）は処理をスキップ
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }

        const newCode = spriteCode[selectedSpriteId] || '';
        // 現在のエディタのドキュメントと新しいコードが異なる場合のみ更新
        // 無駄な dispatch を避けるため
        if (editorInstance.current.state.doc.toString() !== newCode) {
            editorInstance.current.dispatch({
                changes: {
                    from: 0,
                    to: editorInstance.current.state.doc.length,
                    insert: newCode
                },
                // エディタを更新する際に、Undo履歴に追加しないようにすることも可能
                // userEvent: "replace"
            });
            console.log(`エディタの内容をスプライトID ${selectedSpriteId} のコードで更新しました。`);
        }
    }, [selectedSpriteId, spriteCode]); // spriteCode も依存に含める

    // props.sprites または props.stage の変更を監視し、spriteCode を更新
    // スプライトが追加/削除された場合にコードマップを更新する
    useEffect(() => {
        const newCodeMap = {};
        let changed = false;

        // 既存のスプライトのコードを保持または初期化
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

        // 存在しないスプライトのコードを削除
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
    }, [props.sprites, props.stage, spriteCode]); // spriteCode も依存に含めることで、新しいオブジェクト参照時に更新

    if (!props.vm.editingTarget) {
        return null;
    }

    return (
        <div
            className={styles.source}
            ref={props.setRef}
            onMouseDown={props.onContainerClick}
        >
            <div style={{ height: '100%', width: '100%' }}>
                {/* CodeMirrorエディタをマウントする場所 */}
                <div ref={editorRef} className="codemirror-container" style={{ height: '100%', width: '100%' }} />
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
