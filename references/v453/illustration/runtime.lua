--! Copyright (c) 2026 amonamona
--! CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/
--! Lightboard XNAI
--! Copyright (c) 2026 amonamona
--! CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/
--! Lightboard XNAI
package.preload["./xnai_cleanHandler"]=function(...)local function removeNode(text, tagName, attrs)
if not text then return '', nil end
local nodes = prelude.queryNodes(tagName, text)
if #nodes == 0 then return text, nil end
local targetNode = nil
if attrs then
for _, node in ipairs(nodes) do
local matchAttrs = true
for k, v in pairs(attrs) do
if node.attributes[k] ~= v then
matchAttrs = false
break
end
end
if matchAttrs then
targetNode = node
break
end
end
else
targetNode = nodes[1]
end
if not targetNode then return text, nil end
local prefix = text:sub(1, targetNode.rangeStart - 1):gsub("\n?$", "")
local suffix = text:sub(targetNode.rangeEnd + 1):gsub("^\n?", "")
local result = prefix .. '\n' .. suffix
return result, #prefix + 2, #text - #result
end
local function stripAllNodes(text, tagName, attrs)
local firstPos = nil
while true do
local removed, pos = removeNode(text, tagName, attrs)
if removed == text then break end
text = removed
if not firstPos then firstPos = pos end
end
return text, firstPos
end
local function clearHistory(triggerId)
local confirmMsg = '정말 캐릭터 태그 기록을 삭제할까요? 되돌릴 수 없습니다.'
local confirmed = alertConfirm(triggerId, confirmMsg):await()
if confirmed then
setChatVar(triggerId, 'lb-xnai-history', '')
end
end
local function clearOldScenes(triggerId)
local confirmMsg = '정말 오래된 이미지들을 채팅에서 정리할까요? 되돌릴 수 없습니다.\n\n정리된 이미지들은 인레이 탐색기에서 계속 볼 수 있습니다.'
local confirmed = alertConfirm(triggerId, confirmMsg):await()
if not confirmed then
return
end
confirmed = alertConfirm(triggerId, '경고: 지금이라도 백업하세요. 오류가 발생해서 텍스트가 엉망이 되어도 되돌릴 수 없습니다. 정말 정리할까요?'):await()
if not confirmed then
return
end
local fullChat = getFullChat(triggerId)
local cleansedChat = {}
for i = 1, #fullChat do
local chat = fullChat[i]
if i < #fullChat - 5 and chat.role == 'char' then
chat.data = stripAllNodes(chat.data, 'lb-xnai')
end
table.insert(cleansedChat, chat)
end
setFullChat(triggerId, cleansedChat)
reloadDisplay(triggerId)
alertNormal(triggerId, '⌛ 정리 완료.')
end
return {
clearHistory = clearHistory,
clearOldScenes = clearOldScenes,
} end
package.preload["./xnai_deleteHandler"]=function(...)local function deleteScene(triggerId, chatIndex, slot)
local confirmMsg = '정말 이 씬을 지우시겠습니까?'
local confirmed = alertConfirm(triggerId, confirmMsg):await()
if not confirmed then
return
end
local fullState = getState(triggerId, 'lb-xnai-stack') or {}
local stackItem = nil
for _, item in ipairs(fullState) do
if item.chatIndex == chatIndex then
stackItem = item
break
end
end
if stackItem and stackItem.data.scenes[slot] then
stackItem.data.scenes[slot] = nil
end
setState(triggerId, 'lb-xnai-stack', fullState)
local targetChat = getChat(triggerId, chatIndex)
local targetNode = prelude.queryNodes('lb-xnai', targetChat.data, { scene = slot })
if #targetNode > 0 then
setChat(triggerId, chatIndex, table.concat({
targetChat.data:sub(1, targetNode[1].rangeStart - 1),
targetChat.data:sub(targetNode[1].rangeEnd + 1),
}))
return
end
end
return {
deleteScene = deleteScene,
} end
package.preload["./xnai_editHandler"]=function(...)local function edit(triggerId, chatIndex, slot)
local fullState = getState(triggerId, 'lb-xnai-stack') or {}
local stackItem = nil
for _, item in ipairs(fullState) do
if item.chatIndex == chatIndex then
stackItem = item
break
end
end
local forKeyvis = slot == '-1'
if not stackItem or (slot ~= nil and (forKeyvis and not stackItem.data.keyvis) and not stackItem.data.scenes[slot]) then
alertNormal(triggerId, '이미지 생성 데이터가 사라졌어요. 오래된 이미지의 데이터는 유지하지 않습니다. 저장 개수 토글을 늘리세요.')
return
end
local targetDesc = forKeyvis and stackItem.data.keyvis or stackItem.data.scenes[slot]
if type(targetDesc.panels) == 'table' then
alertNormal(triggerId, '멀티패널 씬은 패널별 구조를 사용하므로 직접 프롬프트 편집을 지원하지 않습니다.')
return
end
local charD = {}
local charP = {}
local charN = {}
for i, charDesc in ipairs(targetDesc.characters or {}) do
table.insert(charD, charDesc.description or '')
table.insert(charP, charDesc.positive or '')
table.insert(charN, charDesc.negative or '')
end
addChat(triggerId, 'user', table.concat({
'<lb-xnai-editing chatIndex="', tostring(chatIndex), '" slot="', slot, '">',
'[Cast]\n',
targetDesc.cast or '',
'\n[Camera]\n',
targetDesc.camera or '',
'\n[Scene]\n',
targetDesc.scene or '',
'\n[CharP]\n',
table.concat(charP, ' | '),
'\n[CharD]\n',
table.concat(charD, ' | '),
'\n[CharN]\n',
table.concat(charN, ' | '),
'</lb-xnai-editing>',
}))
end
return {
edit = edit,
} end
package.preload["./xnai_regenHandler"]=function(...)local function getOperationNodes(text, operationID)
if operationID then
return prelude.queryNodes('lb-xnai', text, { operation = operationID })
end
return prelude.queryNodes('lb-xnai', text)
end
local function locateOperationChat(triggerId, preferredIndex, operationID)
local fullChat = getFullChat(triggerId)
local preferredChat = fullChat[preferredIndex + 1]
if preferredChat and type(preferredChat.data) == 'string' then
local nodes = getOperationNodes(preferredChat.data, operationID)
if #nodes > 0 then
return preferredIndex, preferredChat, nodes
end
end
if not operationID then
return nil, nil, {}
end
for i = #fullChat, 1, -1 do
local chat = fullChat[i]
if type(chat.data) == 'string' then
local nodes = getOperationNodes(chat.data, operationID)
if #nodes > 0 then
return i - 1, chat, nodes
end
end
end
return nil, nil, {}
end
local function regenerate(triggerId, chatIndex, operationID, slot)
prelude.info(triggerId, 'lb-xnai.regenerate',
'Regeneration started. chatIndex=' .. tostring(chatIndex) ..
', operation=' .. tostring(operationID) .. ', slot=' .. tostring(slot))
local fullState = getState(triggerId, 'lb-xnai-stack') or {}
local stackItem = nil
for _, item in ipairs(fullState) do
if (operationID and item.operationID == operationID) or (not operationID and item.chatIndex == chatIndex) then
stackItem = item
break
end
end
local forKeyvis = slot == '-1'
local selectedDescriptor = nil
if stackItem and slot and slot ~= '' then
selectedDescriptor = forKeyvis and stackItem.data.keyvis or stackItem.data.scenes[slot]
end
if not stackItem or (slot ~= nil and slot ~= '' and not selectedDescriptor) then
pcall(reloadChat, triggerId, chatIndex)
alertNormal(triggerId, '이미지 생성 데이터가 사라졌어요. 오래된 이미지의 데이터는 유지하지 않습니다. 저장 개수 토글을 늘리세요.')
return
end
local descriptors = {}
local requestedCount = 0
if selectedDescriptor then
requestedCount = 1
descriptors[slot] = selectedDescriptor
else
if stackItem.data.keyvis then
requestedCount = requestedCount + 1
descriptors['-1'] = stackItem.data.keyvis
end
for sceneSlot, desc in pairs(stackItem.data.scenes or {}) do
requestedCount = requestedCount + 1
descriptors[tostring(sceneSlot)] = desc
end
end
if requestedCount == 0 then
pcall(reloadChat, triggerId, chatIndex)
return
end
local success, result = pcall(function()
local inlays = {}
local generatedCount = 0
local gen = prelude.import(triggerId, 'lb-xnai.gen')
for sceneSlot, desc in pairs(descriptors) do
inlays[sceneSlot] = gen.generate(triggerId, desc)
generatedCount = generatedCount + 1
end
prelude.verbose(triggerId, 'lb-xnai.regenerate',
'Images generated. count=' .. tostring(generatedCount))
local resolvedIndex, targetChat, targetNodes = locateOperationChat(triggerId, chatIndex, operationID)
if not resolvedIndex or not targetChat then
error('이미지 생성 중 대상 채팅이 이동했거나 사라졌습니다.')
end
prelude.verbose(triggerId, 'lb-xnai.regenerate',
'Target reacquired. chatIndex=' .. tostring(resolvedIndex) .. ', nodes=' .. tostring(#targetNodes))
local out = targetChat.data
local replacedCount = 0
for i = #targetNodes, 1, -1 do
local node = targetNodes[i]
local keyvis = node.attributes.kv == 'true'
local targetNodeSlot = keyvis and '-1' or node.attributes.scene
local inlay = inlays[targetNodeSlot]
if inlay then
local openTag = node.openTag:gsub('%s*/%s*>$', '>')
out = table.concat({
out:sub(1, node.rangeStart - 1),
openTag,
inlay,
'</lb-xnai>',
out:sub(node.rangeEnd + 1),
})
replacedCount = replacedCount + 1
end
end
if replacedCount ~= generatedCount then
error('생성된 이미지와 삽입된 이미지 수가 다릅니다. generated=' .. tostring(generatedCount) ..
', replaced=' .. tostring(replacedCount))
end
setChat(triggerId, resolvedIndex, out)
local writtenChat = getChat(triggerId, resolvedIndex)
if not writtenChat or writtenChat.data ~= out then
error('대상 채팅에 이미지 결과가 정상적으로 저장되지 않았습니다.')
end
reloadChat(triggerId, resolvedIndex)
if stackItem.chatIndex ~= resolvedIndex then
stackItem.chatIndex = resolvedIndex
local stateUpdated, stateError = pcall(setState, triggerId, 'lb-xnai-stack', fullState)
if not stateUpdated then
prelude.info(triggerId, 'lb-xnai.regenerate',
'State index update failed. error=' .. tostring(stateError))
end
end
return {
generatedCount = generatedCount,
replacedCount = replacedCount,
resolvedIndex = resolvedIndex,
}
end)
if not success then
local targetIndex = locateOperationChat(triggerId, chatIndex, operationID) or chatIndex
pcall(reloadChat, triggerId, targetIndex)
prelude.info(triggerId, 'lb-xnai.regenerate', 'Regeneration failed. error=' .. tostring(result))
alertNormal(triggerId, '이미지 삽입 중 오류가 발생했습니다.\n' .. tostring(result))
return
end
prelude.info(triggerId, 'lb-xnai.regenerate',
'Regeneration committed. chatIndex=' .. tostring(result.resolvedIndex) ..
', generated=' .. tostring(result.generatedCount) .. ', replaced=' .. tostring(result.replacedCount))
end
return {
regenerate = regenerate,
} end
local t_concat = table.concat
local triggerId = ''
local function info(...)
prelude.info(triggerId, 'lb-xnai', ...)
end
local function verbose(...)
prelude.verbose(triggerId, 'lb-xnai', ...)
end
local function setTriggerId(tid)
triggerId = tid
if type(prelude) ~= 'nil' then
prelude.import(tid, 'toon.decode')
return
end
local source = getLoreBooks(triggerId, 'lightboard-prelude')
if not source or #source == 0 then
error('Failed to load lightboard-prelude.')
end
load(source[1].content, '@prelude', 't')()
prelude.import(tid, 'toon.decode')
end
local function createGenerationCode(chatIndex, operationID, slot)
local code = t_concat({ 'lb-xnai-gen/', chatIndex, slot and ('_' .. slot) or '' })
if operationID then
return code .. '#' .. operationID
end
return code
end
local function Placeholder(inputID, code, text)
return h.div['lb-xnai-placeholder-wrapper'] {
h.input['lb-xnai-placeholder-state'] {
id = inputID,
type = 'radio',
void = true,
},
h.label['lb-xnai-placeholder'] {
htmlFor = inputID,
risu_btn = code,
title = text,
h.span['lb-xnai-placeholder-idle'] { '✦ ' .. text },
h.span['lb-xnai-placeholder-loading'] {
h.span['lb-xnai-placeholder-spinner'] {},
'생성 중, 다른 조작을 하지 마세요',
},
},
}
end
local function buildRawPrompt(desc)
local gen = prelude.import(triggerId, 'lb-xnai.gen')
return gen.buildRawPrompt(triggerId, desc)
end
local function createFullsizePop(popID, inlay, promptPreview, toolbarItems)
return h.dialog['lb-xnai-fullsize-pop'] {
id = popID,
popover = '',
h.div['lb-xnai-fullsize-pop-body'] {
h.button {
popovertarget = popID,
type = 'button',
inlay,
},
promptPreview,
h.div['lb-xnai-fullsize-actions'] { table.unpack(toolbarItems) },
}
}
end
local function createModuleMenu(chatIndex, operationID)
local menuID = t_concat({ 'lb-xnai-menu-', chatIndex })
local allStateID = t_concat({ 'lb-xnai-all-', chatIndex })
return h.div['lb-module-opener-root'] {
data_id = 'lb-xnai',
h.button['lb-module-opener'] {
popovertarget = menuID,
title = '삽화 메뉴',
type = 'button',
'삽화',
},
h.dialog['lb-xnai-menu'] {
id = menuID,
popover = '',
h.button {
popovertarget = menuID,
risu_btn = 'lb-xnai-clearOldScenes',
type = 'button',
h.lb_trash_icon { closed = true },
'오래된 이미지 제거',
},
h.button {
popovertarget = menuID,
risu_btn = 'lb-xnai-clearHistory',
type = 'button',
h.lb_trash_icon { closed = true },
'캐릭터 태그 기록 삭제',
},
h.input['lb-xnai-all-state'] {
id = allStateID,
type = 'checkbox',
void = true,
},
h.label {
htmlFor = allStateID,
popovertarget = menuID,
risu_btn = createGenerationCode(chatIndex, operationID),
h.lb_xnai_ff_icon { closed = true },
'이미지 모두 재생성',
},
h.button {
popovertarget = menuID,
risu_btn = 'lb-reroll__lb-xnai',
type = 'button',
h.lb_reroll_icon { closed = true },
'처음부터 다시 만들기',
},
h.button {
popovertarget = menuID,
risu_btn = 'lb-interaction__lb-xnai__DirectScene',
type = 'button',
h.lb_comment_icon { closed = true },
'요청하기',
},
},
}
end
local function renderInline(data, chatIndex, stackItem)
local imageNodes = prelude.queryNodes('lb-xnai', data)
local out = data
local sceneIndexBySlot = {}
if stackItem and stackItem.data and stackItem.data.scenes then
local sortedSlots = {}
for slotStr in pairs(stackItem.data.scenes) do
table.insert(sortedSlots, tonumber(slotStr) or slotStr)
end
table.sort(sortedSlots, function(a, b)
return (tonumber(a) or 0) < (tonumber(b) or 0)
end)
for idx, s in ipairs(sortedSlots) do
sceneIndexBySlot[tostring(s)] = idx - 1
end
end
local kv = nil
for nodeIndex = #imageNodes, 1, -1 do
local imageNode = imageNodes[nodeIndex]
local slot = imageNode.attributes.scene
local operationID = imageNode.attributes.operation or (stackItem and stackItem.operationID)
local inlay = prelude.trim(imageNode.content)
local popID = t_concat({ 'lb-xnai-pop-', chatIndex, '-', nodeIndex })
local promptID = t_concat({ 'lb-xnai-prompt-', chatIndex, '-', nodeIndex })
local imgStateID = t_concat({ 'lb-xnai-img-', chatIndex, '-', nodeIndex })
if slot then
if inlay == '' and stackItem and stackItem.data.scenes[slot] then
local placeholderText = t_concat({ '씬 #', nodeIndex, ' 생성' })
local inputID = t_concat({ 'lb-xnai-placeholder-', chatIndex, '-', nodeIndex })
out = t_concat({
out:sub(1, imageNode.rangeStart - 1),
tostring(Placeholder(inputID, createGenerationCode(chatIndex, operationID, slot), placeholderText)),
out:sub(imageNode.rangeEnd + 1),
})
elseif inlay ~= '' then
local inStack = stackItem and stackItem.data.scenes[slot]
local editable = inStack and type(stackItem.data.scenes[slot].panels) ~= 'table'
local sceneIdx = sceneIndexBySlot[tostring(slot)]
local function createToolbar(fullsizePop)
return {
inStack and h.button['lb-xnai-toolbar-btn'] {
popovertarget = fullsizePop and popID or nil,
risu_btn = t_concat({
'lb-interaction__lb-xnai__id=scene-', slot, ';immediate',
'#RegenerateScene/ChatIndex:', chatIndex, '/Slot:', slot,
sceneIdx and ('/Index:' .. sceneIdx) or '',
}),
title = '프롬프트 재생성',
type = 'button',
h.lb_reroll_icon { closed = true },
} or nil,
inStack and h.label['lb-xnai-toolbar-btn'] {
htmlFor = imgStateID,
popovertarget = fullsizePop and popID or nil,
risu_btn = createGenerationCode(chatIndex, operationID, slot),
title = '이미지 재생성',
h.lb_play_icon { closed = true },
} or nil,
h.button['lb-xnai-toolbar-btn'] {
popovertarget = fullsizePop and popID or nil,
risu_btn = t_concat({ 'lb-xnai-delete/', chatIndex, '_', slot }),
title = '제거',
type = 'button',
h.lb_trash_icon { closed = true },
},
fullsizePop and inStack and h.label['lb-xnai-toolbar-btn'] {
htmlFor = promptID,
title = '프롬프트 확인',
h.lb_comment_icon { closed = true }
} or nil,
editable and h.button['lb-xnai-toolbar-btn'] {
popovertarget = fullsizePop and popID or nil,
risu_btn = t_concat({ 'lb-xnai-edit/', chatIndex, '_', slot }),
title = '프롬프트 편집',
h.lb_xnai_edit_icon { closed = true }
} or nil,
}
end
local prompts = inStack and buildRawPrompt(stackItem.data.scenes[slot]) or { positive = '', negative = '' }
local promptPreview = inStack and h.div['lb-xnai-fullsize-prompt-wrapper'] {
h.input { id = promptID, type = 'checkbox' },
h.pre['lb-xnai-fullsize-prompt'] {
'[Positive]\n',
prompts.positive,
h.br { void = true },
h.br { void = true },
'[Negative]\n',
prompts.negative or '',
}
} or nil
local fullsizePop = createFullsizePop(popID, inlay, promptPreview, createToolbar(true))
local inlineImage = h.button {
popovertarget = popID,
type = 'button',
inlay,
}
local sceneLoadingOverlay = h.div['lb-xnai-loading-overlay'] {
h.span['lb-xnai-placeholder-spinner'] {},
'생성 중, 다른 조작을 하지 마세요',
}
out = t_concat({
out:sub(1, imageNode.rangeStart - 1),
tostring(h.div['lb-xnai-inlay-wrapper'] {
h.div['lb-xnai-inlay'] {
h.input['lb-xnai-img-state'] {
id = imgStateID,
type = 'radio',
void = true,
},
h.div['lb-xnai-inlay-actions'] { table.unpack(createToolbar()) },
inlineImage,
sceneLoadingOverlay,
fullsizePop,
}
}),
'\n',
out:sub(imageNode.rangeEnd + 1),
})
end
else
local inStack = stackItem and stackItem.data.keyvis
local kvImgStateID = t_concat({ 'lb-xnai-img-', chatIndex, '-kv' })
if inlay == '' and inStack then
local inputID = t_concat({ 'lb-xnai-placeholder-', chatIndex, '-', nodeIndex })
kv = tostring(Placeholder(inputID, createGenerationCode(chatIndex, operationID, '-1'),
'키 비주얼 생성'))
out = t_concat({
out:sub(1, imageNode.rangeStart - 1),
out:sub(imageNode.rangeEnd + 1),
})
elseif inlay ~= '' then
local function createToolbar(fullsizePop)
return {
inStack and h.label['lb-xnai-toolbar-btn'] {
htmlFor = kvImgStateID,
popovertarget = fullsizePop and popID or nil,
risu_btn = createGenerationCode(chatIndex, operationID, '-1'),
title = '이미지 재생성',
h.lb_play_icon { closed = true },
} or nil,
fullsizePop and inStack and h.label['lb-xnai-toolbar-btn'] {
htmlFor = promptID,
title = '프롬프트 확인',
h.lb_comment_icon { closed = true }
} or nil,
inStack and h.button['lb-xnai-toolbar-btn'] {
popovertarget = fullsizePop and popID or nil,
risu_btn = t_concat({ 'lb-xnai-edit/', chatIndex, '_-1' }),
title = '프롬프트 편집',
h.lb_xnai_edit_icon { closed = true }
} or nil,
}
end
local prompts = inStack and buildRawPrompt(stackItem.data.keyvis) or { positive = '', negative = '' }
local promptPreview = inStack and h.div['lb-xnai-fullsize-prompt-wrapper'] {
h.input { id = promptID, type = 'checkbox' },
h.pre['lb-xnai-fullsize-prompt'] {
'[Positive]\n',
prompts.positive,
h.br { void = true },
h.br { void = true },
'[Negative]\n',
prompts.negative or '',
}
} or nil
local fullsizePop = createFullsizePop(popID, inlay, promptPreview, createToolbar(true))
local kvLoadingOverlay = h.div['lb-xnai-loading-overlay'] {
h.span['lb-xnai-placeholder-spinner'] {},
'생성 중, 다른 조작을 하지 마세요',
}
kv = tostring(h.div['lb-xnai-kv-wrapper'] {
h.input['lb-xnai-img-state'] {
id = kvImgStateID,
type = 'radio',
void = true,
},
h.div['lb-xnai-kv-actions'] { table.unpack(createToolbar()) },
h.button['lb-xnai-kv'] {
popovertarget = popID,
type = 'button',
inlay,
kvLoadingOverlay,
},
fullsizePop
})
out = t_concat({
out:sub(1, imageNode.rangeStart - 1),
out:sub(imageNode.rangeEnd + 1),
})
end
end
end
if kv then
local xnaiPos = getGlobalVar(triggerId, 'toggle_lb-xnai.kv.position') or '0'
local lbdataAtTop = out:match('^%s*%-%-%-\n%[LBDATA START%]')
local lbdataAtBottom = out:match('%[LBDATA END%]%s*\n%-%-%-\n?%s*$')
if xnaiPos == '0' then
if lbdataAtTop then
local lbdataEndPos = out:find('%[LBDATA END%]%s*\n%-%-%-')
local insertPos = out:find('\n', out:find('%-%-%-', lbdataEndPos))
if insertPos then
out = out:sub(1, insertPos) .. '\n' .. kv .. out:sub(insertPos + 1)
else
out = out .. '\n\n' .. kv
end
else
out = kv .. '\n\n' .. out
end
else
local lbdataStartPos = lbdataAtBottom and out:find('%-%-%-\n%[LBDATA START%]')
if lbdataStartPos then
out = out:sub(1, lbdataStartPos - 1) .. kv .. '\n\n' .. out:sub(lbdataStartPos)
else
out = out .. '\n\n' .. kv
end
end
end
if stackItem and #imageNodes > 0 then
local lazyNodes = prelude.queryNodes('lb-lazy', out, { id = 'lb-xnai' })
for nodeIndex = #lazyNodes, 1, -1 do
local lazyNode = lazyNodes[nodeIndex]
out = t_concat({
out:sub(1, lazyNode.rangeStart - 1),
tostring(createModuleMenu(chatIndex, stackItem.operationID)),
out:sub(lazyNode.rangeEnd + 1),
})
end
end
return out
end
listenEdit(
'editDisplay',
function(tid, data, meta)
setTriggerId(tid)
if not meta or not meta.index then
return data
end
local chatLength = getChatLength(triggerId)
local position = meta.index - chatLength
if position < -7 then
return data
end
local fullState = getState(triggerId, 'lb-xnai-stack') or {}
local stackItem = nil
local imageNodes = prelude.queryNodes('lb-xnai', data)
local operationID = imageNodes[1] and imageNodes[1].attributes.operation
for _, item in ipairs(fullState) do
if (operationID and item.operationID == operationID) or (not operationID and item.chatIndex == meta.index) then
stackItem = item
break
end
end
local success, result = pcall(renderInline, data, meta.index, stackItem)
if success then
return result
end
print("[Lightboard] Illustration inline render failed:", tostring(result))
return data
end
)
local cleanHandler = require('./xnai_cleanHandler')
local deleteHandler = require('./xnai_deleteHandler')
local editHandler = require('./xnai_editHandler')
local regenHandler = require('./xnai_regenHandler')
onButtonClick = async(function(tid, code)
setTriggerId(tid)
verbose('Button clicked. code=' .. tostring(code))
if code == 'lb-xnai-clearHistory' then
return cleanHandler.clearHistory(tid)
end
if code == 'lb-xnai-clearOldScenes' then
return cleanHandler.clearOldScenes(tid)
end
local deletePrefix = 'lb%-xnai%-delete/'
local _, deletePrefixEnd = string.find(code, deletePrefix)
if deletePrefixEnd then
local body = code:sub(deletePrefixEnd + 1)
if body == '' then
return
end
local parts = prelude.split(body, '_')
if #parts < 1 then
return
end
local chatIndex = tonumber(parts[1])
local slot = parts[2]
if not chatIndex or not slot then
return
end
return deleteHandler.deleteScene(tid, chatIndex, slot)
end
local genPrefix = 'lb%-xnai%-gen/'
local _, genPrefixEnd = string.find(code, genPrefix)
if genPrefixEnd then
local body = code:sub(genPrefixEnd + 1)
local hashIndex = body:find('#', 1, true)
local operationID = nil
if hashIndex then
operationID = body:sub(hashIndex + 1)
body = body:sub(1, hashIndex - 1)
end
local parts = prelude.split(body, '_')
local chatIndex = tonumber(parts[1])
local slot = parts[2]
if not chatIndex then
return
end
return regenHandler.regenerate(tid, chatIndex, operationID, slot)
end
local editPrefix = 'lb%-xnai%-edit/'
local _, editPrefixEnd = string.find(code, editPrefix)
if editPrefixEnd then
local body = code:sub(editPrefixEnd + 1)
local parts = prelude.split(body, '_')
local chatIndex = tonumber(parts[1])
local slot = parts[2]
if not chatIndex or not slot then
return
end
return editHandler.edit(tid, chatIndex, slot)
end
end)
onStart = function(tid)
setTriggerId(tid)
local fullChat = getFullChat(triggerId)
local lastChat = fullChat[#fullChat]
local secondLastChat = fullChat[#fullChat - 1]
local promptNode = prelude.queryNodes('lb-xnai-editing', secondLastChat.data)
if #promptNode == 0 then
return
end
local chatIndex = tonumber(promptNode[1].attributes.chatIndex)
local slot = promptNode[1].attributes.slot
info('Applying prompt edit. chatIndex=' .. tostring(chatIndex) .. ', slot=' .. tostring(slot))
if not chatIndex or not slot or slot == '' then
return
end
local fullState = getState(triggerId, 'lb-xnai-stack') or {}
local stackItem = nil
for _, item in ipairs(fullState) do
if item.chatIndex == chatIndex then
stackItem = item
break
end
end
local forKeyvis = slot == '-1'
if not stackItem or ((forKeyvis and not stackItem.data.keyvis) and not stackItem.data.scenes[slot]) then
return
end
local targetDesc = forKeyvis and stackItem.data.keyvis or stackItem.data.scenes[slot]
if type(targetDesc.panels) == 'table' then
return
end
stopChat(triggerId)
local camera = lastChat.data:match("%[Camera%]%s*(.-)%s*%[Scene%]")
local scene = lastChat.data:match("%[Scene%]%s*(.-)%s*%[CharP%]")
local charP = lastChat.data:match("%[CharP%]%s*(.-)%s*%[CharD%]")
local charD = lastChat.data:match("%[CharD%]%s*(.-)%s*%[CharN%]")
local charN = lastChat.data:match("%[CharN%]%s*(.*)")
camera = camera and prelude.trim(camera) or ''
scene = scene and prelude.trim(scene) or ''
charP = charP and prelude.trim(charP) or ''
charD = charD and prelude.trim(charD) or ''
charN = charN and prelude.trim(charN) or ''
local charPParts = prelude.split(charP, '|')
local charDParts = prelude.split(charD, '|')
local charNParts = prelude.split(charN, '|')
local cast = lastChat.data:match("%[Cast%]%s*(.-)%s*%[Camera%]")
local previousCharacters = targetDesc.characters or {}
local characters = {}
local maxLen = math.max(#charPParts, #charDParts, #charNParts)
for i = 1, maxLen do
local previousCharacter = previousCharacters[i] or {}
table.insert(characters, {
description = prelude.trim(charDParts[i] or ''),
name = previousCharacter.name,
negative = prelude.trim(charNParts[i] or ''),
positive = prelude.trim(charPParts[i] or ''),
})
end
targetDesc.camera = camera
targetDesc.cast = cast and prelude.trim(cast) or ''
targetDesc.characters = characters
targetDesc.scene = scene
if not forKeyvis then
targetDesc.slot = tonumber(slot)
end
local gen = prelude.import(triggerId, 'lb-xnai.gen')
gen.persistStateAndHistory(triggerId, fullState)
reloadChat(triggerId, chatIndex)
removeChat(triggerId, -2)
removeChat(triggerId, -1)
end
