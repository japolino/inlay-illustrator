local function info(tid, ...)
  prelude.info(tid, 'lb-xnai.onOutput', ...)
end

local function verbose(tid, ...)
  prelude.verbose(tid, 'lb-xnai.onOutput', ...)
end

---@param text string
---@param slot string
---@return string
local function removeSceneNode(text, slot)
  local nodes = prelude.queryNodes('lb-xnai', text, { scene = slot })
  if #nodes == 0 then
    return text
  end

  for i = #nodes, 1, -1 do
    local node = nodes[i]
    local startPos = node.rangeStart
    local endPos = node.rangeEnd
    local after = text:sub(endPos + 1)
    local nlLen = 0
    if after:match('^\r?\n\r?\n') then
      nlLen = after:find('\r?\n\r?\n') == 1 and #(after:match('^\r?\n\r?\n')) or 0
    elseif after:match('^\r?\n') then
      nlLen = after:find('\r?\n') == 1 and #(after:match('^\r?\n')) or 0
    end
    text = text:sub(1, startPos - 1) .. text:sub(endPos + 1 + nlLen)
  end

  return text
end

---@param text string
---@return string
local function removeKeyvisNode(text)
  local nodes = prelude.queryNodes('lb-xnai', text, { kv = true })
  if #nodes == 0 then
    nodes = prelude.queryNodes('lb-xnai', text, { id = 'keyvis' })
  end
  if #nodes == 0 then
    return text
  end

  for i = #nodes, 1, -1 do
    local node = nodes[i]
    local startPos = node.rangeStart
    local endPos = node.rangeEnd
    local before = text:sub(1, startPos - 1)
    local trailingNl = before:match('\r?\n\r?\n$') and 2 or (before:match('\r?\n$') and 1 or 0)
    startPos = startPos - trailingNl
    text = text:sub(1, startPos - 1) .. text:sub(endPos + 1)
  end

  return text
end

---@param a any
---@param b any
---@return boolean
local function isSameDescriptor(a, b)
  if a == b then
    return true
  end
  if type(a) ~= 'table' or type(b) ~= 'table' then
    return false
  end
  for k, v in pairs(a) do
    if not isSameDescriptor(v, b[k]) then
      return false
    end
  end
  for k in pairs(b) do
    if a[k] == nil then
      return false
    end
  end
  return true
end

---@param tid string
---@param patchNode Node
---@param fullChatContent string
---@param index number
---@param gen XNAIGen
---@return string?, string?
local function applyPatchInteraction(tid, patchNode, fullChatContent, index, gen)
  local patchContent = prelude.trim(patchNode.content)
  local success, patch = pcall(json.decode, patchContent)
  if not success or type(patch) ~= 'table' then
    info(tid, 'Patch decoding failed. error=' .. tostring(patch))
    return nil, '<lb-lazy id="lb-xnai" />'
  end

  info(tid, 'Applying patch interaction. chatIndex=' .. tostring(index) .. ', ops=' .. tostring(#patch))

  ---@type XNAIStackItem[]
  local xnaiState = getState(tid, 'lb-xnai-stack') or {}
  if type(xnaiState) ~= 'table' then
    return nil, '<lb-lazy id="lb-xnai" />'
  end

  local stackItem = nil
  for _, item in ipairs(xnaiState) do
    if item.chatIndex == index then
      stackItem = item
      break
    end
  end
  if not stackItem then
    return nil, '<lb-lazy id="lb-xnai" />'
  end

  local sortedSlots = {}
  for slotStr in pairs(stackItem.data.scenes or {}) do
    table.insert(sortedSlots, tonumber(slotStr) or slotStr)
  end
  table.sort(sortedSlots, function(a, b)
    return (tonumber(a) or 0) < (tonumber(b) or 0)
  end)

  local originalScenes = {}
  for _, s in ipairs(sortedSlots) do
    local sceneDesc = stackItem.data.scenes[tostring(s)]
    if sceneDesc then
      table.insert(originalScenes, sceneDesc)
    end
  end

  local targetDocument = {
    keyvis = stackItem.data.keyvis,
    scenes = originalScenes,
  }

  local patchSuccess, patched = pcall(prelude.applyJSONPatch, targetDocument, patch)
  if not patchSuccess then
    error('JSON Patch 적용 실패: ' .. tostring(patched))
  end

  local _, slottedContext, restoreNodes = gen.buildContextSlotMap(tid, fullChatContent)
  local slottedText = restoreNodes(slottedContext)
  local slotErrors = gen.validateSceneSlots(tid, patched.scenes, slottedText)
  if #slotErrors > 0 then
    error('삽화 삽입 실패. ' .. table.concat(slotErrors, '\n'))
  end

  local operationID = stackItem.operationID or tid
  local shouldGenerateNow = getGlobalVar(tid, 'toggle_lb-xnai.generation') ~= '1'

  local oldScenes = stackItem.data.scenes or {}
  local newScenes = {}
  for _, scene in ipairs(patched.scenes or {}) do
    if type(scene) == 'table' and scene.slot ~= nil then
      newScenes[tostring(scene.slot)] = scene
    end
  end

  local inlays = {}

  for slot, scene in pairs(newScenes) do
    local existingNodes = prelude.queryNodes('lb-xnai', fullChatContent, { scene = slot })
    local existingInlay = #existingNodes > 0 and prelude.trim(existingNodes[1].content) or ''
    local unchanged = oldScenes[slot] and isSameDescriptor(oldScenes[slot], scene)

    if unchanged and existingInlay ~= '' then
      inlays[slot] = existingInlay
    elseif shouldGenerateNow then
      local ok, inlay = pcall(gen.generate, tid, scene)
      if ok and inlay then
        inlays[slot] = inlay
      else
        info(tid, 'Interaction scene generation failed. slot=' .. slot .. ', error=' .. tostring(inlay))
        if existingInlay ~= '' then
          inlays[slot] = existingInlay
        end
      end
    end
  end

  if patched.keyvis then
    local kvNodes = prelude.queryNodes('lb-xnai', fullChatContent, { kv = true })
    if #kvNodes == 0 then
      kvNodes = prelude.queryNodes('lb-xnai', fullChatContent, { id = 'keyvis' })
    end
    local existingKvInlay = #kvNodes > 0 and prelude.trim(kvNodes[1].content) or ''
    local unchangedKv = stackItem.data.keyvis and isSameDescriptor(stackItem.data.keyvis, patched.keyvis)

    if unchangedKv and existingKvInlay ~= '' then
      inlays['-1'] = existingKvInlay
    elseif shouldGenerateNow then
      local ok, inlay = pcall(gen.generate, tid, patched.keyvis)
      if ok and inlay then
        inlays['-1'] = inlay
      else
        info(tid, 'Interaction key visual generation failed. error=' .. tostring(inlay))
        if existingKvInlay ~= '' then
          inlays['-1'] = existingKvInlay
        end
      end
    end
  end

  for slot in pairs(oldScenes) do
    if not newScenes[slot] then
      fullChatContent = removeSceneNode(fullChatContent, slot)
      verbose(tid, 'Removed scene node. slot=' .. slot)
    end
  end

  local nodesToReplace = {}
  for slot in pairs(newScenes) do
    local nodes = prelude.queryNodes('lb-xnai', fullChatContent, { scene = slot })
    if #nodes > 0 then
      table.insert(nodesToReplace, {
        node = nodes[1],
        slot = slot,
      })
    end
  end
  table.sort(nodesToReplace, function(a, b)
    return a.node.rangeStart > b.node.rangeStart
  end)

  for _, item in ipairs(nodesToReplace) do
    local slot = item.slot
    local node = item.node
    local replacement
    if inlays[slot] then
      replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. operationID .. '" scene="' .. slot .. '">' ..
          inlays[slot] .. '</lb-xnai>'
    else
      replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. operationID .. '" scene="' .. slot .. '" />'
    end

    fullChatContent = table.concat({
      fullChatContent:sub(1, node.rangeStart - 1),
      replacement,
      fullChatContent:sub(node.rangeEnd + 1),
    })
  end

  local slotsToInsert = {}
  for slot in pairs(newScenes) do
    local nodes = prelude.queryNodes('lb-xnai', fullChatContent, { scene = slot })
    if #nodes == 0 then
      table.insert(slotsToInsert, slot)
    end
  end

  if #slotsToInsert > 0 then
    local _, slotted, restoreNodes = gen.buildContextSlotMap(tid, fullChatContent)
    for _, slot in ipairs(slotsToInsert) do
      local replacement
      if inlays[slot] then
        replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. operationID .. '" scene="' .. slot .. '">' ..
            inlays[slot] .. '</lb-xnai>'
      else
        replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. operationID .. '" scene="' .. slot .. '" />'
      end

      slotted = slotted:gsub('<slot num="' .. slot .. '"/>', function()
        return replacement
      end, 1)
    end

    slotted = slotted:gsub('<slot num="%d+"/>\n\n', '')
    fullChatContent = restoreNodes(slotted)
  end

  local existingKvNodes = prelude.queryNodes('lb-xnai', fullChatContent, { kv = true })
  if #existingKvNodes == 0 then
    existingKvNodes = prelude.queryNodes('lb-xnai', fullChatContent, { id = 'keyvis' })
  end

  if not patched.keyvis then
    if #existingKvNodes > 0 then
      fullChatContent = removeKeyvisNode(fullChatContent)
    end
  else
    local kvReplacement
    if inlays['-1'] then
      kvReplacement = '<lb-xnai id="keyvis" kv operation="' .. operationID .. '">' .. inlays['-1'] .. '</lb-xnai>'
    else
      kvReplacement = '<lb-xnai id="keyvis" kv operation="' .. operationID .. '" />'
    end

    if #existingKvNodes > 0 then
      local kvNode = existingKvNodes[1]
      fullChatContent = table.concat({
        fullChatContent:sub(1, kvNode.rangeStart - 1),
        kvReplacement,
        fullChatContent:sub(kvNode.rangeEnd + 1),
      })
    else
      fullChatContent = fullChatContent .. '\n\n' .. kvReplacement
    end
  end

  stackItem.data.keyvis = patched.keyvis
  stackItem.data.scenes = newScenes
  gen.persistStateAndHistory(tid, xnaiState)

  return fullChatContent, nil
end

---@param tid string
---@param output string
---@param fullChatContent string
---@param index number
local function main(tid, output, fullChatContent, index)
  local forcedInsertion = getGlobalVar(tid, 'toggle_lb-xnai.forcedinsertion') == '1'
  verbose(tid, 'Processing output. chatIndex=' .. tostring(index) .. ', forcedInsertion=' .. tostring(forcedInsertion))

  output = output:gsub('wfsn', 'nsfw')
  if forcedInsertion then
    output = output:gsub('%%', '')
  end

  local patchNodes = prelude.queryNodes('lb-xnai-patch', output)
  if #patchNodes > 0 then
    ---@type XNAIGen
    local gen = prelude.import(tid, 'lb-xnai.gen')
    return applyPatchInteraction(tid, patchNodes[#patchNodes], fullChatContent, index, gen)
  end

  if not string.find(output, '<lb%-xnai') then
    return nil
  end

  if not string.find(output, '</lb%-xnai>') then
    output = output .. '\n</lb-xnai>'
  end

  local nodes = prelude.queryNodes('lb-xnai', output)
  verbose(tid, 'Output nodes found. count=' .. tostring(#nodes))

  ---@type XNAIGen
  local gen = prelude.import(tid, 'lb-xnai.gen')

  local node = nodes[#nodes]
  local cleanedContent = gen.cleanDescriptionBlocks(node.content)
  local success, xnaiData = pcall(prelude.toon.decode, cleanedContent)

  if success then
    ---@type XNAIResponse
    local response = xnaiData
    info(tid, 'Output decoded. keyvis=' .. tostring(response.keyvis ~= nil) ..
      ', scenes=' .. tostring(#(response.scenes or {})))

    local _, slotted, restoreNodes = gen.buildContextSlotMap(tid, fullChatContent)
    local _, availableSlots = slotted:gsub('<slot num="%d+"/>', '')
    verbose(tid, 'Slot map built. availableSlots=' .. tostring(availableSlots))
    local slotErrors = gen.validateSceneSlots(tid, response.scenes, slotted)
    if #slotErrors > 0 then
      error('삽화 삽입 실패. ' .. table.concat(slotErrors, '\n'))
    end

    ---@type XNAIStackItem[]
    local xnaiState = getState(tid, 'lb-xnai-stack') or {}
    if type(xnaiState) ~= 'table' then
      xnaiState = {}
    else
      -- prevent duplicate chat index happening caused by rerolls
      for i = #xnaiState, 1, -1 do
        if xnaiState[i].chatIndex == index then
          table.remove(xnaiState, i)
          break
        end
      end
    end

    ---@type XNAIStackItem
    local stackItem = {
      chatIndex = index,
      data = {
        keyvis = response.keyvis,
        scenes = {},
      },
      operationID = tid,
    }

    local shouldGenerateNow = getGlobalVar(tid, 'toggle_lb-xnai.generation') ~= '1'
    verbose(tid, 'Automatic image generation=' .. tostring(shouldGenerateNow))

    ---@type table<string, string>
    local inlays = {}

    if shouldGenerateNow then
      if response.keyvis then
        local ok, inlay = pcall(gen.generate, tid, response.keyvis)
        if ok and inlay then
          inlays['-1'] = inlay
        elseif not ok then
          info(tid, 'Key visual generation failed. error=' .. tostring(inlay))
        end
      end
    end

    for _, scene in ipairs(response.scenes or {}) do
      local slot = tostring(scene.slot)
      stackItem.data.scenes[slot] = scene
      if shouldGenerateNow then
        local ok, inlay = pcall(gen.generate, tid, scene)
        if ok and inlay then
          inlays[slot] = inlay
        elseif not ok then
          info(tid, 'Scene generation failed. slot=' .. slot .. ', error=' .. tostring(inlay))
        end
      end
    end

    table.insert(xnaiState, stackItem)
    xnaiState = select(1, gen.persistStateAndHistory(tid, xnaiState))

    for _, scene in ipairs(response.scenes or {}) do
      local slot = tostring(scene.slot)
      local replacement
      if inlays[slot] then
        replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. tid .. '" scene="' .. slot .. '">' ..
            inlays[slot] .. '</lb-xnai>'
      else
        replacement = '<lb-xnai id="scene-' .. slot .. '" operation="' .. tid .. '" scene="' .. slot .. '" />'
      end

      local replacementCount
      slotted, replacementCount = slotted:gsub('<slot num="' .. slot .. '"/>', function()
        return replacement
      end, 1)
      if replacementCount == 0 then
        info(tid, 'Scene insertion failed. slot=' .. slot .. ', availableSlots=' .. tostring(availableSlots))
      else
        verbose(tid, 'Scene inserted. slot=' .. slot)
      end
    end

    slotted = slotted:gsub('<slot num="%d+"/>\n\n', '')
    slotted = restoreNodes(slotted)

    local finalOutput
    if inlays['-1'] then
      finalOutput = slotted .. '\n\n<lb-xnai id="keyvis" kv operation="' .. tid .. '">' ..
          inlays['-1'] .. '</lb-xnai>'
    else
      finalOutput = slotted .. '\n\n<lb-xnai id="keyvis" kv operation="' .. tid .. '" />'
    end

    verbose(tid, 'Output composition completed. length=' .. tostring(#finalOutput))
    return finalOutput, '<lb-lazy id="lb-xnai" />'
  end

  verbose(tid, 'Output decoding failed. error=' .. tostring(xnaiData))

  return nil, '<lb-lazy id="lb-xnai" />'
end

return main
