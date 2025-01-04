import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import { connect } from 'react-redux';

import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

class SourceTab extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, ['handleCodeChange']);
        this.editorRef = React.createRef();

        this.state = {
            spriteCode: this.initializeSpriteCode(props.sprites, props.stage),
            selectedSpriteId: props.editingTarget,
            editorLoaded: false // エディタがロード済みかを管理
        };
    }

    componentDidMount() {
        // CodeMirrorのCSSとJSをCDNからロード
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
            });
        };

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

        Promise.all([
            loadStyle('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.7/codemirror.min.css'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.7/codemirror.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.7/mode/javascript/javascript.min.js')
        ])
            .then(() => {
                this.initializeEditor();
            })
            .catch((error) => {
                console.error('Failed to load CodeMirror:', error);
            });
    }

    componentWillUnmount() {
        if (this.editor) {
            this.editor.toTextArea();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.selectedSpriteId !== this.state.selectedSpriteId && this.state.editorLoaded) {
            const newCode = this.state.spriteCode[this.state.selectedSpriteId] || '';
            this.editor.setValue(newCode);
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
        if (!window.CodeMirror) {
            console.error('CodeMirror is not loaded.');
            return;
        }

        this.editor = window.CodeMirror(this.editorRef.current, {
            mode: 'javascript',
            lineNumbers: true,
            lineWrapping: true,
            value: this.state.spriteCode[this.state.selectedSpriteId] || ''
        });

        this.editor.setSize("100%", "100%");

        this.editor.on('change', this.handleCodeChange);

        this.setState({ editorLoaded: true });
    }

    handleCodeChange() {
        const newCode = this.editor.getValue();
        const { selectedSpriteId, spriteCode } = this.state;

        this.setState({
            spriteCode: {
                ...spriteCode,
                [selectedSpriteId]: newCode
            }
        });
    }

    render() {
        if (!this.props.vm.editingTarget) {
            return null;
        }

        return (
            <div>
                <div ref={this.editorRef} style={{ height: '100%', width: '100%' }} />
            </div>
        );
    }
}

SourceTab.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.object.isRequired,
    stage: PropTypes.object,
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
