import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import styles from '../components/source/source.css'; // このスタイルは既存のものをそのまま利用
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab'; // 必要に応じて維持
import { setRestore } from '../reducers/restore-deletion'; // 必要に応じて維持
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx'; // 必要に応じて維持

// CodeMirror 6のモジュールをCDNから動的にインポートするためのヘルパー関数
// 通常はnpmでインストールし、バンドラーで処理しますが、ここではCDN利用の例として示します。
const loadCodeMirror6Modules = async () => {
    // CodeMirror 6のコアモジュール
    const { EditorState } = await import("https://cdn.jsdelivr.net/npm/@codemirror/state@6.4.1/+esm");
    const { EditorView, keymap, highlightActiveLine } = await import("https://cdn.jsdelivr.net/npm/@codemirror/view@6.26.0/+esm");

    // 基本的なセットアップ（履歴、キーマップ、行番号など）
    // @codemirror/basic-setupは古いバージョンのCodeMirror 6のパッケージ名。
    // 現在は codemirror パッケージに統合されているため、直接 codemirror をインポートする
    // ただし、npmを使用しない場合、basicSetupは個別の拡張機能の組み合わせとなることが多い
    // ここでは、一般的な拡張機能を個別にインポートする形にする
    const { indentWithTab } = await import("https://cdn.jsdelivr.net/npm/@codemirror/commands@6.3.3/+esm");

    // 言語サポート
    const { javascript } = await import("https://cdn.jsdelivr.net/npm/@codemirror/lang-javascript@6.2.1/+esm");

    // テーマ (例: oneDark)
    const { oneDark } = await import("https://cdn.jsdelivr.net/npm/@codemirror/theme-one-dark@6.1.2/+esm");
    // CodeMirrorのデフォルトスタイルもインポートする必要があります。
    // これらは通常、CSSファイルとして提供されるため、<link>タグでロードします。
    // CodeMirror 6にはデフォルトのテーマがないため、別途テーマをインポートするか、
    // 独自のスタイルを定義する必要があります。ここでは `oneDark` を使用。
    // CodeMirrorの基本ビューのスタイルは、JavaScriptで動的に追加するか、
    // 直接CSSを読み込む必要があります。

    return {
        EditorState,
        EditorView,
        keymap,
        highlightActiveLine,
        indentWithTab,
        javascript,
        oneDark,
        // ここにさらに必要な拡張機能を追加
    };
};

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

    // CodeMirror 6の基本的なスタイルを動的に追加
    useEffect(() => {
        // CodeMirror 6はデフォルトのCSSファイルを持たないため、
        // テーマや言語拡張が提供するCSSをロードする必要があります。
        // ここでは、oneDarkテーマのCSSをロードする例を示します。
        // EditorViewの基本的なスタイルも必要であれば追加します。
        const loadStyle = (href) => {
            return new Promise((resolve, reject) => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.onload = resolve;
                link.onerror = reject;
                document.head.appendChild(link);
            });
        };

        // oneDarkテーマのCSSをロード
        loadStyle('https://cdn.jsdelivr.net/npm/@codemirror/theme-one-dark@6.1.2/dist/index.css')
            .catch(error => console.error('Failed to load CodeMirror theme CSS:', error));

        // CodeMirrorの基本ビューのスタイル（必要に応じて）
        // CodeMirror 6はデフォルトで最小限のスタイルしか提供しません。
        // 特定のコンポーネント（例: 行番号）のスタイルが必要な場合は、
        // 関連するパッケージのCSSを読み込むか、自分で定義する必要があります。
        // 例: loadStyle('https://cdn.jsdelivr.net/npm/@codemirror/view@6.26.0/dist/editor.css');
    }, []);


    // エディタの初期化とクリーンアップ
    useEffect(() => {
        const initializeEditor = async () => {
            try {
                // CodeMirror 6のモジュールを動的にロード
                const cm = await loadCodeMirror6Modules();

                // エディタの初期コンテンツ
                const initialDoc = spriteCode[selectedSpriteId] || '';

                // エディタの拡張機能の定義
                const extensions = [
                    cm.javascript(), // JavaScript言語サポート
                    cm.keymap.of([cm.indentWithTab]), // Tabキーでのインデント
                    cm.highlightActiveLine(), // アクティブな行のハイライト
                    cm.oneDark, // ダークテーマ
                    // basicSetupの個別の拡張機能（必要に応じて追加）
                    // cm.lineNumbers(), // 行番号
                    // cm.history(), // 履歴
                    // cm.undoRedo(), // アンドゥ/リドゥ
                    // cm.syntaxHighlighting(), // シンタックスハイライト（言語拡張に含まれるが明示的に追加することも）
                    cm.EditorView.lineWrapping, // 行の折り返し
                    cm.EditorView.updateListener.of((update) => {
                        // エディタの内容が変更されたときのコールバック
                        if (update.docChanged) {
                            handleCodeChange(update.state.doc.toString());
                        }
                    })
                ];

                // エディタの状態を作成
                const startState = cm.EditorState.create({
                    doc: initialDoc,
                    extensions: extensions
                });

                // エディタのビューを作成し、DOM要素にマウント
                const view = new cm.EditorView({
                    state: startState,
                    parent: editorRef.current
                });

                // editorInstance refにエディタインスタンスを保存
                editorInstance.current = view;

            } catch (error) {
                console.error('Failed to initialize CodeMirror 6:', error);
            }
        };

        if (editorRef.current && !editorInstance.current) {
            initializeEditor();
        }

        // クリーンアップ関数: コンポーネントがアンマウントされるときにエディタを破棄
        return () => {
            if (editorInstance.current) {
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


    // selectedSpriteId または editingTarget が変更されたときの処理
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    useEffect(() => {
        // selectedSpriteId が変更され、かつエディタがロード済みの場合
        if (editorInstance.current && selectedSpriteId) {
            const newCode = spriteCode[selectedSpriteId] || '';
            // エディタの値を更新
            editorInstance.current.dispatch({
                changes: {
                    from: 0,
                    to: editorInstance.current.state.doc.length,
                    insert: newCode
                }
            });
        }
    }, [selectedSpriteId, spriteCode]); // spriteCode も依存に含める

    // props.sprites または props.stage の変更を監視し、spriteCode を更新
    useEffect(() => {
        const newCodeMap = {};
        Object.keys(props.sprites).forEach((spriteId) => {
            newCodeMap[spriteId] = spriteCode[spriteId] || ''; // 既存のコードを保持
        });
        if (props.stage) {
            newCodeMap[props.stage.id] = spriteCode[props.stage.id] || ''; // 既存のコードを保持
        }
        // 古いスプライトのコードを削除 (オプション)
        for (const id in spriteCode) {
            if (!(id in newCodeMap)) {
                delete spriteCode[id];
            }
        }
        setSpriteCode(newCodeMap);
    }, [props.sprites, props.stage]);


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