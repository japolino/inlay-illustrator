local function verbose(tid, ...)
  prelude.verbose(tid, 'lb-xnai.onValidate', ...)
end

---@param errors string[]
---@param character any
---@param label string
local function validateCharacter(errors, character, label)
  if type(character) ~= 'table' then
    table.insert(errors, label .. ' is not a valid object. Parsed type: ' .. type(character))
    return
  end

  if type(character.positive) ~= 'string' or character.positive == '' then
    table.insert(errors,
      label .. ' (positive) is empty or not a valid string. Parsed type: ' .. type(character.positive))
  end
  if type(character.description) ~= 'string' or character.description == '' then
    table.insert(errors,
      label .. ' (description) is empty or not a valid string. Parsed type: ' .. type(character.description))
  end
  if character.negative and type(character.negative) ~= 'string' then
    table.insert(errors,
      label .. ' (negative) is not a valid string. Parsed type: ' .. type(character.negative))
  end
end

---@param errors string[]
---@param panel any
---@param label string
---@param standalone boolean
local function validatePanel(errors, panel, label, standalone)
  if type(panel) ~= 'table' then
    table.insert(errors, label .. ' is not a valid object. Parsed type: ' .. type(panel))
    return
  end

  if standalone then
    if type(panel.camera) ~= 'string' or panel.camera == '' then
      table.insert(errors, label .. ' has no camera field. Parsed type: ' .. type(panel.camera))
    end
    if type(panel.cast) ~= 'string' or panel.cast == '' then
      table.insert(errors, label .. ' has no cast field. Parsed type: ' .. type(panel.cast))
    end
  end

  if type(panel.characters) ~= 'table' then
    table.insert(errors,
      label .. ' characters is not a valid array. Parsed type: ' .. type(panel.characters))
  else
    for characterIndex, character in ipairs(panel.characters) do
      validateCharacter(errors, character, label .. ', character ' .. (characterIndex - 1))
    end
  end

  if type(panel.scene) ~= 'string' or panel.scene == '' then
    table.insert(errors, label .. ' has no scene field. Parsed type: ' .. type(panel.scene))
  end
end

---@param errors string[]
---@param desc any
---@param label string
---@param panelsRequired boolean
---@param slotRequired boolean
local function validateDescriptor(errors, desc, label, panelsRequired, slotRequired)
  if type(desc) ~= 'table' then
    table.insert(errors, label .. ' is not a valid object. Parsed type: ' .. type(desc))
    return
  end

  if panelsRequired then
    if type(desc.cast) ~= 'string' or desc.cast == '' then
      table.insert(errors, label .. ' has no cast field. Parsed type: ' .. type(desc.cast))
    end

    if type(desc.panels) ~= 'table' then
      table.insert(errors, label .. ' panels is not a valid array. Parsed type: ' .. type(desc.panels))
    elseif #desc.panels == 0 then
      table.insert(errors, label .. ' has no panel in its panels array.')
    else
      for panelIndex, panel in ipairs(desc.panels) do
        validatePanel(errors, panel, label .. ', panel ' .. (panelIndex - 1), false)
      end
    end
  else
    if desc.panels ~= nil then
      table.insert(errors, label .. ' cannot contain panels.')
    else
      validatePanel(errors, desc, label, true)
    end
  end

  if slotRequired and type(desc.slot) ~= 'number' then
    table.insert(errors, label .. ' has invalid slot field. Parsed type: ' .. type(desc.slot))
  end
end

---@param errors string[]
---@param tid string
---@param node Node
---@param label string
---@param gen XNAIGen
---@param comic boolean
local function validateNode(errors, tid, node, label, gen, comic)
  local cleanedContent = gen.cleanDescriptionBlocks(node.content)
  local success, content = pcall(prelude.toon.decode, cleanedContent)
  if not success then
    table.insert(errors, label .. ' has invalid TOON format. ' .. tostring(content))
    return
  end
  if type(content) ~= 'table' then
    table.insert(errors, label .. ' has an invalid root. Parsed type: ' .. type(content))
    return
  end

  --- @type XNAIResponse
  local response = content

  if response.interaction ~= nil and response.interaction ~= true then
    table.insert(errors, label .. ' interaction marker must be true when present.')
  end

  if response.scenes ~= nil and type(response.scenes) ~= 'table' then
    table.insert(errors, label .. ' scenes is not a valid array. Parsed type: ' .. type(response.scenes))
  else
    for sceneIndex, desc in ipairs(response.scenes or {}) do
      validateDescriptor(errors, desc, label .. ', scene ' .. (sceneIndex - 1), comic, true)
    end
    for _, slotError in ipairs(gen.validateSceneSlots(tid, response.scenes)) do
      table.insert(errors, slotError)
    end
  end

  if response.keyvis ~= nil then
    validateDescriptor(errors, response.keyvis, label .. ', keyvis', false, false)
  end

  if response.interaction == true then
    if type(response.scenes) ~= 'table' or #response.scenes ~= 1 then
      table.insert(errors, label .. ' interaction must contain exactly one Scene.')
    end
    if response.keyvis ~= nil then
      table.insert(errors, label .. ' interaction cannot contain a Key Visual.')
    end
  end
end

---@param errors string[]
---@param tid string
---@param patch any
---@param gen XNAIGen
---@param comic boolean
local function validatePatch(errors, tid, patch, gen, comic)
  if type(patch) ~= 'table' then
    table.insert(errors, '<lb-xnai-patch> must contain a JSON array.')
    return
  end

  local operationCount = 0
  for key in pairs(patch) do
    if type(key) ~= 'number' or key < 1 or key % 1 ~= 0 then
      table.insert(errors, '<lb-xnai-patch> must contain a JSON array.')
      return
    end
    operationCount = operationCount + 1
  end

  if operationCount ~= #patch then
    table.insert(errors, 'JSON Patch array must not contain gaps.')
    return
  end
  if operationCount == 0 then
    table.insert(errors, 'JSON Patch array must contain at least one operation.')
    return
  end

  for operationIndex, operation in ipairs(patch) do
    local label = 'Patch operation ' .. (operationIndex - 1)
    if type(operation) ~= 'table' then
      table.insert(errors, label .. ' must be an object.')
    else
      if operation.op ~= 'add' and operation.op ~= 'remove' and operation.op ~= 'replace' then
        table.insert(errors, label .. ' op must be add, remove, or replace.')
      end
      if type(operation.path) ~= 'string' then
        table.insert(errors, label .. ' requires a string path.')
      else
        if operation.path ~= '' and operation.path:sub(1, 1) ~= '/' then
          table.insert(errors, label .. ' path must be empty or begin with /.')
        end
        if operation.path:find('~[^01]') or operation.path:sub(-1) == '~' then
          table.insert(errors, label .. ' path contains an invalid escape.')
        end
      end
      if operation.op ~= 'remove' and rawget(operation, 'value') == nil then
        table.insert(errors, label .. ' add and replace operations require value.')
      end

      if operation.op ~= 'remove' and type(operation.path) == 'string' then
        if operation.path:match('^/scenes/%d+$') or operation.path == '/scenes/-' then
          if type(operation.value) == 'table' then
            validateDescriptor(errors, operation.value, label .. ' scene', comic, true)
            for _, slotError in ipairs(gen.validateSceneSlots(tid, { operation.value })) do
              table.insert(errors, slotError)
            end
          else
            table.insert(errors, label .. ' scene value must be an object.')
          end
        elseif operation.path == '/keyvis' then
          if type(operation.value) == 'table' then
            validateDescriptor(errors, operation.value, label .. ' keyvis', false, false)
          else
            table.insert(errors, label .. ' keyvis value must be an object.')
          end
        end
      end
    end
  end
end

local function main(tid, output, context)
  ---@type XNAIGen
  local gen = prelude.import(tid, 'lb-xnai.gen')
  local comicMode = getGlobalVar(tid, 'toggle_lb-xnai.scene.comic')
  local comic = comicMode == '1' or comicMode == '2'

  local patchNodes = prelude.queryNodes('lb-xnai-patch', output)
  if #patchNodes > 0 then
    verbose(tid, 'Patch validation started.')
    local success, patch = pcall(json.decode, prelude.trim(patchNodes[#patchNodes].content))
    if not success then
      error('InvalidOutput: Invalid JSON Patch. ' .. tostring(patch))
    end

    local errors = {}
    validatePatch(errors, tid, patch, gen, comic)

    if context and #errors == 0 then
      local stackItem = nil
      local xnaiState = getState(tid, 'lb-xnai-stack') or {}
      if type(xnaiState) == 'table' then
        if context.chatIndex then
          for _, item in ipairs(xnaiState) do
            if item.chatIndex == context.chatIndex then
              stackItem = item
              break
            end
          end
        end
        if not stackItem and #xnaiState > 0 then
          stackItem = xnaiState[#xnaiState]
        end
      end

      if stackItem and type(stackItem.data) == 'table' then
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
          table.insert(errors, 'Failed to apply JSON Patch: ' .. tostring(patched))
        else
          if type(patched.scenes) == 'table' then
            for sceneIndex, scene in ipairs(patched.scenes) do
              validateDescriptor(errors, scene, 'Patched scene ' .. (sceneIndex - 1), comic, true)
            end
            for _, slotError in ipairs(gen.validateSceneSlots(tid, patched.scenes)) do
              table.insert(errors, slotError)
            end
          end
          if patched.keyvis ~= nil then
            validateDescriptor(errors, patched.keyvis, 'Patched keyvis', false, false)
          end
        end
      end
    end

    if #errors > 0 then
      verbose(tid, 'Patch validation failed. errors=' .. tostring(#errors))
      error('InvalidOutput: Malformed patch. Aggregated errors:\n\n' .. table.concat(errors, '\n'))
    end
    verbose(tid, 'Patch validation completed.')
    return
  end

  local nodes = prelude.queryNodes('lb-xnai', output)
  verbose(tid, 'Validation started. nodes=' .. tostring(#nodes))
  if #nodes == 0 then
    error('InvalidOutput: Missing <lb-xnai> or <lb-xnai-patch> node.')
  end

  local errors = {}
  validateNode(errors, tid, nodes[#nodes], 'Output', gen, comic)

  if #errors > 0 then
    verbose(tid, 'Validation failed. errors=' .. tostring(#errors))
    error('InvalidOutput: Malformed data. Aggregated errors:\n\n' .. table.concat(errors, '\n'))
  end

  verbose(tid, 'Validation completed.')
end

return main
