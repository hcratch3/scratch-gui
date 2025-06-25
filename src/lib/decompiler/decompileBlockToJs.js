/**
 * Scratch 3.0のブロックデータをプログラミング初心者にも分かりやすいJavaScript風のコードに変換するデコンパイラ。
 * これは簡略化された実装であり、全てのブロックタイプや複雑な構造に対応するものではありません。
 *
 * @param {object | Map<string, Object>} blocksMap - VMから取得したブロックIDをキーとするブロックオブジェクトのMapまたはプレーンオブジェクト
 * @param {string} startBlockId - スクリプトの開始ブロックのID (通常はハットブロック)
 * @param {number} indentLevel - 現在のインデントレベル
 * @returns {string} 生成されたJavaScript風のコード文字列
 */
const decompileBlockToJs = (blocksMap, startBlockId, indentLevel = 0) => {
    let code = '';
    // blocksMapがMapかオブジェクトかに応じてgetまたはブラケット記法を使用するヘルパー関数
    const getBlockById = (map, id) => {
        if (!map || !id) return null;
        if (map instanceof Map) {
            return map.get(id);
        } else if (typeof map === 'object') {
            return map[id];
        }
        return null;
    };

    let currentBlock = getBlockById(blocksMap, startBlockId);
    const indent = '\t'.repeat(indentLevel);

    // ヘルパー関数: 入力ブロックまたはフィールドの値を解決
    const resolveInput = (input) => {
        if (!input) return 'undefined';

        // 値ブロック（VALUE, VARIABLE, LIST, BROADCAST_MESSAGE）
        if (input.block) {
            const connectedBlock = getBlockById(blocksMap, input.block);
            if (connectedBlock) {
                // 入れ子ブロックはインデントなしで解決し、文字列または数値として返す
                // math_numberの場合、直接fields.NUM.valueを使用
                if (connectedBlock.opcode === 'math_number' && connectedBlock.fields && connectedBlock.fields.NUM) {
                    return JSON.stringify(connectedBlock.fields.NUM.value);
                }
                // それ以外の値ブロック（例: 変数、演算結果）
                return decompileBlockToJs(blocksMap, connectedBlock.id, 0).trim(); // trim()で余分な改行や空白を除去
            }
        }
        // シャドウブロック（非接続の値）やフィールド
        if (input.shadow) {
            const shadowBlock = getBlockById(blocksMap, input.shadow);
            if (shadowBlock) {
                // シャドウブロックの値を解決 (数値、文字列など)
                if (shadowBlock.opcode === 'math_number' && shadowBlock.fields && shadowBlock.fields.NUM) {
                    return JSON.stringify(shadowBlock.fields.NUM.value);
                }
                // その他のシャドウブロックの値 (例: sayのテキストボックス)
                if (shadowBlock.fields && shadowBlock.fields.TEXT) {
                    return JSON.stringify(shadowBlock.fields.TEXT.value);
                }
            }
        }
        // フィールド（例: 変数名、メッセージ名）
        if (input.fields && input.fields.VARIABLE) {
            return JSON.stringify(input.fields.VARIABLE.value);
        }
        // デフォルトの直接値 (あまり使われないが念のため)
        if (input.value !== undefined) {
            return JSON.stringify(input.value);
        }
        return 'null'; // 解決できない場合
    };

    // ヘルパー関数: フィールドの値を解決 (主にドロップダウンや変数名)
    const resolveField = (field) => {
        if (!field) return 'undefined';
        if (field.value !== undefined) {
            return typeof field.value === 'string' ? JSON.stringify(field.value) : field.value;
        }
        return 'null';
    };

    while (currentBlock) {
        let line = indent;
        const opcode = currentBlock.opcode;
        const inputs = currentBlock.inputs || {};
        const fields = currentBlock.fields || {};

        switch (opcode) {
            // --- イベントブロック ---
            case 'event_whenflagclicked':
                line += `onGreenFlagClicked() {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}}`;
                currentBlock = null; // ハットブロックなので次はない
                break;
            case 'event_whenkeypressed':
                line += `onKeyPressed(${resolveField(fields.KEY_OPTION)}) {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}}`;
                currentBlock = null;
                break;
            case 'event_whenthisspriteclicked':
                line += `onSpriteClicked() {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}}`;
                currentBlock = null;
                break;
            case 'event_whenbroadcastreceived':
                line += `onReceive(${resolveField(fields.BROADCAST_OPTION)}) {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}}`;
                currentBlock = null;
                break;

            // --- 動きブロック ---
            case 'motion_movesteps':
                line += `move(${resolveInput(inputs.STEPS)});`;
                break;
            case 'motion_turnright':
                line += `turnRight(${resolveInput(inputs.DEGREES)});`;
                break;
            case 'motion_turnleft':
                line += `turnLeft(${resolveInput(inputs.DEGREES)});`;
                break;
            case 'motion_goto':
                line += `goTo(${resolveInput(inputs.TO)});`;
                break;
            case 'motion_gotoxy':
                line += `goToX(${resolveInput(inputs.X)}), Y(${resolveInput(inputs.Y)});`;
                break;
            case 'motion_changexby':
                line += `changeXby(${resolveInput(inputs.DX)});`;
                break;
            case 'motion_setx':
                line += `setXto(${resolveInput(inputs.X)});`;
                break;
            case 'motion_changeyby':
                line += `changeYby(${resolveInput(inputs.DY)});`;
                break;
            case 'motion_sety':
                line += `setYto(${resolveInput(inputs.Y)});`;
                break;

            // --- 見た目ブロック ---
            case 'looks_sayforsecs':
                line += `say(${resolveInput(inputs.MESSAGE)}, ${resolveInput(inputs.SECS)});`;
                break;
            case 'looks_say':
                line += `say(${resolveInput(inputs.MESSAGE)});`;
                break;
            case 'looks_thinkforsecs':
                line += `think(${resolveInput(inputs.MESSAGE)}, ${resolveInput(inputs.SECS)});`;
                break;
            case 'looks_think':
                line += `think(${resolveInput(inputs.MESSAGE)});`;
                break;
            case 'looks_show':
                line += `show();`;
                break;
            case 'looks_hide':
                line += `hide();`;
                break;
            case 'looks_nextcostume':
                line += `nextCostume();`;
                break;
            case 'looks_switchcostumeto':
                line += `switchCostumeTo(${resolveField(fields.COSTUME)});`;
                break;

            // --- 制御ブロック ---
            case 'control_wait':
                line += `wait(${resolveInput(inputs.DURATION)});`;
                break;
            case 'control_repeat':
                line += `repeat(${resolveInput(inputs.TIMES)}) {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}}`;
                break;
            case 'control_forever':
                line += `forever() {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}}`;
                break;
            case 'control_if':
                line += `if (${decompileBlockToJs(blocksMap, inputs.CONDITION.block, 0)}) {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}}`;
                break;
            case 'control_if_else':
                line += `if (${decompileBlockToJs(blocksMap, inputs.CONDITION.block, 0)}) {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}} else {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK2.block, indentLevel + 1);
                line += `${indent}}`;
                break;
            
            // --- 演算ブロック ---
            case 'operator_add':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} + ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_subtract':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} - ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_multiply':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} * ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_divide':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} / ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_random':
                line += `random(${decompileBlockToJs(blocksMap, inputs.FROM.block, 0)}, ${decompileBlockToJs(blocksMap, inputs.TO.block, 0)})`;
                break;
            case 'operator_gt':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} > ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_lt':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} < ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_equals':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} === ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_and':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} && ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_or':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} || ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_not':
                line += `!(${decompileBlockToJs(blocksMap, inputs.OPERAND.block, 0)})`;
                break;
            case 'operator_join':
                line += `join(${decompileBlockToJs(blocksMap, inputs.STRING1.block, 0)}, ${decompileBlockToJs(blocksMap, inputs.STRING2.block, 0)})`;
                break;

            // --- 変数ブロック ---
            case 'data_setvariableto':
                line += `setVariable(${resolveField(fields.VARIABLE)}, ${resolveInput(inputs.VALUE)});`;
                break;
            case 'data_changevariableby':
                line += `changeVariableBy(${resolveField(fields.VARIABLE)}, ${resolveInput(inputs.VALUE)});`;
                break;
            case 'data_variable': // 変数名を取得 (reporter)
                line += `${resolveField(fields.VARIABLE)}`;
                break;
            
            // --- 数値リテラル (reporter) ---
            case 'math_number':
                line += `${resolveField(fields.NUM)}`;
                break;

            // --- その他 (reporter) ---
            case 'sensing_askandwait':
                line += `ask(${resolveInput(inputs.QUESTION)});`;
                break;
            case 'sensing_answer':
                line += `answer`;
                break;
            case 'looks_backdropname':
                line += `backdropName`;
                break;
            case 'looks_costume':
                line += `costumeName`;
                break;
            case 'motion_xposition':
                line += `xPosition`;
                break;
            case 'motion_yposition':
                line += `yPosition`;
                break;
            case 'motion_direction':
                line += `direction`;
                break;

            default:
                // 未対応のブロックはコメントアウトして、元のJSON情報を出力
                line += `// Unsupported Block: ${opcode} ${JSON.stringify(currentBlock, null, 2).replace(/\n/g, `\n${indent}// `)}`;
                break;
        }

        code += line + '\n';
        if (currentBlock && currentBlock.next) {
            currentBlock = getBlockById(blocksMap, currentBlock.next);
        } else {
            currentBlock = null;
        }
    }
    return code;
};

export default decompileBlockToJs;
