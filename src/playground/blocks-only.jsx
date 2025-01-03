import React from 'react';
import ReactDOM from 'react-dom';
import {connect} from 'react-redux';

import Controls from '../containers/controls.jsx';
import Blocks from '../containers/blocks.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import AppStateHOC from '../lib/app-state-hoc.jsx';

import styles from './blocks-only.css';

const mapStateToProps = state => ({vm: state.scratchGui.vm});

const VMBlocks = connect(mapStateToProps)(Blocks);
const VMControls = connect(mapStateToProps)(Controls);

import addExtensionIcon from './components/gui/icon--extensions.svg';

const BlocksOnly = props => (
    <GUI {...props}>
        <VMBlocks
            grow={1}
            options={{
                media: `static/blocks-media/default/`
            }}
        />
        <Box className={styles.extensionButtonContainer}>
          <button
            className={styles.extensionButton}
            title={intl.formatMessage(messages.addExtension)}
            onClick={onExtensionButtonClick}
          >
            <img
              className={styles.extensionButtonIcon}
              draggable={false}
              src={addExtensionIcon}
            />
          </button>
        </Box>
        <VMControls className={styles.controls} />
    </GUI>
);

const App = AppStateHOC(HashParserHOC(BlocksOnly));

const appTarget = document.createElement('div');
document.body.appendChild(appTarget);

ReactDOM.render(<App />, appTarget);
