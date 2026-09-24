---@class XNAIPromptSet
---@field description string?
---@field name string?
---@field negative string?
---@field positive string

local COMIC_NEGATIVE_PROMPT = 'framed, outside border'
local COMIC_PROMPT =
'A one-page manga with few panels of varied sizes. A natural manga page layout with clear panel borders, varied panel sizes, and expressive visual storytelling. Use strong manga impact lines around characters.'

---@param text string
---@return string
local function cleanDescriptionBlocks(text)
  local normalized = text:gsub('\r\n', '\n'):gsub('\r', '\n')
  local lines = {}

  for line in (normalized .. '\n'):gmatch('(.-)\n') do
    table.insert(lines, line)
  end

  local cleaned = {}
  local lineIndex = 1

  while lineIndex <= #lines do
    local line = lines[lineIndex]
    local indent = line:match('^([ \t]*)') or ''
    local descriptionBlock = line:match('^[ \t]*description:[ \t]*[>|][+-]?[ \t]*$') ~= nil

    if descriptionBlock then
      local parts = {}
      local nextIndex = lineIndex + 1

      while nextIndex <= #lines do
        local nextLine = lines[nextIndex]
        local nextIndent = nextLine:match('^([ \t]*)') or ''

        if nextLine:match('^[ \t]*$') then
          nextIndex = nextIndex + 1
        elseif #nextIndent > #indent then
          table.insert(parts, nextLine:match('^[ \t]*(.-)[ \t]*$') or '')
          nextIndex = nextIndex + 1
        else
          break
        end
      end

      table.insert(cleaned, indent .. 'description: ' .. table.concat(parts, ' '))
      lineIndex = nextIndex
    else
      table.insert(cleaned, line)
      lineIndex = lineIndex + 1
    end
  end

  return table.concat(cleaned, '\n')
end

---@param value any
---@return string
local function trimText(value)
  if type(value) ~= 'string' then
    return ''
  end
  return prelude.trim(value)
end

---@param character XNAIPromptSet
---@param panelIndex? number
---@return XNAIPromptSet
local function compileCharacter(character, panelIndex)
  local description = trimText(character.description)
  local positive = trimText(character.positive)

  if description ~= '' then
    positive = positive ~= '' and positive .. '. ' .. description or description
  end
  if panelIndex then
    local panelTag = 'panel ' .. tostring(panelIndex)
    positive = positive ~= '' and positive .. ', ' .. panelTag or panelTag
  end

  return {
    name = character.name,
    negative = character.negative,
    positive = positive,
  }
end

---@param values any[]
---@return string
local function joinNonempty(values)
  local parts = {}

  for _, value in ipairs(values) do
    local text = trimText(value)
    if text ~= '' then
      table.insert(parts, text)
    end
  end

  return table.concat(parts, ', ')
end

---@param desc XNAIDescriptor
---@param comicPrompt boolean
---@return { characters: XNAIPromptSet[], comic: boolean, description: string, setup: string }
local function compileDescriptor(desc, comicPrompt)
  local characters = {}
  local comic = type(desc.panels) == 'table' and #desc.panels > 0

  if comic then
    local panelPrompts = {}
    local setup = comicPrompt and COMIC_PROMPT or ''
    local cast = trimText(desc.cast)

    if cast ~= '' then
      setup = setup ~= '' and setup .. '\n\n' .. cast or cast
    end

    for panelIndex, panel in ipairs(desc.panels) do
      local panelPrompt = 'Panel ' .. tostring(panelIndex) .. ': ' .. trimText(panel.scene)
      table.insert(panelPrompts, panelPrompt)

      for _, character in ipairs(panel.characters or {}) do
        table.insert(characters, compileCharacter(character, panelIndex))
      end
    end

    return {
      characters = characters,
      comic = true,
      description = table.concat(panelPrompts, '\n'),
      setup = setup,
    }
  end

  for _, character in ipairs(desc.characters or {}) do
    table.insert(characters, compileCharacter(character))
  end

  return {
    characters = characters,
    comic = false,
    description = '',
    setup = joinNonempty({ desc.cast or '', desc.camera or '', desc.scene or '' }),
  }
end

local function buildKeyvisTitlePrompt()
  local charName = trimText(getName())
  if charName ~= '' then
    return '1.2::A title text of "' ..
        charName ..
        '" is written in the very center of the image:: 0.75::like a movie title or a book title. ::'
  end
  return ''
end

---@param triggerId string
---@param desc XNAIDescriptor
---@return XNAIPromptSet
local function buildRawPrompt(triggerId, desc)
  local comicPrompt = getGlobalVar(triggerId, 'toggle_lb-xnai.scene.comic') == '1'
  local compiled = compileDescriptor(desc, comicPrompt)
  local positiveParts = {}
  local charsPositive = {}
  local charsNegative = {}

  if compiled.setup ~= '' then
    table.insert(positiveParts, compiled.setup)
  end
  if desc and desc.slot == nil and getGlobalVar(triggerId, 'toggle_lb-xnai.kv.title') == '1' then
    local titlePrompt = buildKeyvisTitlePrompt()
    if titlePrompt ~= '' then
      table.insert(positiveParts, titlePrompt)
    end
  end
  if compiled.description ~= '' then
    table.insert(positiveParts, compiled.description)
  end

  for _, character in ipairs(compiled.characters) do
    table.insert(charsNegative, character.negative or '')
    table.insert(charsPositive, character.positive or '')
  end
  if #charsPositive > 0 then
    table.insert(positiveParts, table.concat(charsPositive, '\n'))
  end

  local negative = table.concat(charsNegative, '\n')
  if compiled.comic then
    negative = negative ~= '' and COMIC_NEGATIVE_PROMPT .. '\n' .. negative or COMIC_NEGATIVE_PROMPT
  end

  return {
    negative = negative,
    positive = table.concat(positiveParts, '\n\n'),
  }
end

---@param input string
---@param factor? number
---@return string
local function attenuatePrompt(input, factor)
  if type(input) ~= 'string' or not input:match('%S') then
    return input or ''
  end

  factor = factor or 0.75
  local result = {}
  local lastIndex = 1
  local pattern = '()([%-]?%d*%.?%d+)::(.-)::()'

  for startIndex, weightStr, content, endIndex in input:gmatch(pattern) do
    if startIndex > lastIndex then
      local prefix = input:sub(lastIndex, startIndex - 1)
      local trimmed = prefix:gsub('%s+$', '')
      if trimmed:match('[%w%z\128-\255]') then
        table.insert(result, string.format('%g::%s ::', factor, trimmed))
      elseif trimmed:match('%S') then
        table.insert(result, trimmed .. ' ')
      end
    end

    local weight = tonumber(weightStr) or 1
    local scaled = weight * factor
    local trimmedContent = content:gsub('^%s*(.-)%s*$', '%1')
    table.insert(result, string.format('%g::%s ::', scaled, trimmedContent))
    lastIndex = endIndex
  end

  if lastIndex <= #input then
    local suffix = input:sub(lastIndex)
    local trimmed = suffix:gsub('%s+$', '')
    if trimmed:match('[%w%z\128-\255]') then
      table.insert(result, string.format('%g::%s ::', factor, trimmed))
    elseif trimmed:match('%S') then
      table.insert(result, trimmed)
    end
  end

  return table.concat(result, '')
end

---@param triggerId string
---@param desc XNAIDescriptor
---@return ImagePromptSet?
local function buildPresetPrompt(triggerId, desc)
  local comicPrompt = getGlobalVar(triggerId, 'toggle_lb-xnai.scene.comic') == '1'
  local compiled = compileDescriptor(desc, comicPrompt)
  local preset = getGlobalVar(triggerId, 'toggle_lb-xnai.preset')
  if not preset or preset == '' or preset == 'null' then
    preset = '1'
  end

  prelude.verbose(triggerId, 'lb-xnai.gen', 'Building prompt. preset=' .. tostring(preset))

  local comfy = getGlobalVar(triggerId, 'toggle_lb-xnai.compat.comfy') == '1'
  if not comfy and getGlobalVar(triggerId, 'toggle_lb-xnai.preset.attenuate') == '1' then
    if compiled.setup ~= '' then
      compiled.setup = attenuatePrompt(compiled.setup)
    end
    if compiled.description ~= '' then
      compiled.description = attenuatePrompt(compiled.description)
    end
  end

  local positiveNote = getGlobalVar(triggerId, 'toggle_lb-xnai.positive') or ''
  if positiveNote == null then
    positiveNote = ''
  end
  if desc and desc.slot == nil and getGlobalVar(triggerId, 'toggle_lb-xnai.kv.title') == '1' then
    local titlePrompt = buildKeyvisTitlePrompt()
    if titlePrompt ~= '' then
      positiveNote = positiveNote ~= '' and (positiveNote .. ', ' .. titlePrompt) or titlePrompt
    end
  end
  local negativeNote = getGlobalVar(triggerId, 'toggle_lb-xnai.negative') or ''
  if negativeNote == null then
    negativeNote = ''
  end
  if compiled.comic then
    negativeNote = negativeNote ~= '' and negativeNote .. ', ' .. COMIC_NEGATIVE_PROMPT or COMIC_NEGATIVE_PROMPT
  end

  ---@type LightboardImage
  local image = prelude.import(triggerId, 'lightboard.image')
  return image.applyImagePreset(triggerId, compiled, {
    characterDivider = comfy and getGlobalVar(triggerId, 'toggle_lb-xnai.compat.charDivider') == '1' and '\n\n' or ' | ',
    characterPromptSeparated = getGlobalVar(triggerId, 'toggle_lb-xnai.compat.charPrompt') == '1',
    comfy = comfy,
    inlineSeparator = compiled.comic and '\n\n' or ', ',
    negativeNote = negativeNote,
    positiveNote = positiveNote,
    presetBookName = '프리셋 ' .. tostring(preset),
    sectionSeparator = compiled.comic and '\n\n' or ',\n\n',
    weightMode = getGlobalVar(triggerId, 'toggle_lb-xnai.compat.weight') == '1' and 'convert' or 'strip',
  })
end

---@param triggerId string
---@param desc XNAIDescriptor
---@return string?
local function generate(triggerId, desc)
  prelude.info(triggerId, 'lb-xnai.gen', 'Image generation started.')

  local prompts = buildPresetPrompt(triggerId, desc)
  if not prompts then
    return error('이미지 프롬프트를 생성할 수 없습니다. 삽화 모듈 프리셋이 있나요?')
  end

  ---@type LightboardImage
  local image = prelude.import(triggerId, 'lightboard.image')
  local inlay = image.generateImageFromPrompts(triggerId, prompts, {
    emptyPositive = '긍정 프롬프트가 비어있어요.',
    requestFailed = '이미지 생성 API 호출 실패. 설정을 다시 점검하세요.',
  })

  prelude.info(triggerId, 'lb-xnai.gen', 'Image generation completed. result=' .. tostring(inlay ~= nil))

  return inlay
end

---@param fullChat Chat[]
---@return number?
local function locateTargetChat(fullChat)
  local targetIndex = nil

  for i = #fullChat, 1, -1 do
    local chat = fullChat[i]
    if prelude.trim(chat.data) ~= '' and chat.role == 'char' then
      local stripped, count = chat.data:gsub('%-%-%-\n%[LBDATA START%].-LBDATA END%]\n%-%-%-', '')

      if count > 0 then
        targetIndex = i - 1 -- Lua 1-based -> JS 0-based
        stripped, _ = prelude.trim(stripped)

        if stripped == '' then
          targetIndex = targetIndex - 1 -- Skip this one; LBDATA-only, content located above
        end

        break
      end
    end
  end

  return targetIndex
end

---@param text string
---@return string
local function insertSlots(text)
  local slotIndex = 0
  local trimmed = text:match('^%s*(.-)%s*$') or text
  trimmed = trimmed:gsub('(\n+)', function(lineBreaks)
    local collapsed = lineBreaks
    if #lineBreaks > 2 then
      collapsed = '\n\n'
    end
    local out = collapsed .. '<slot num="' .. slotIndex .. '"/>\n\n'
    slotIndex = slotIndex + 1
    return out
  end)
  return trimmed
end

---Maps visible newline boundaries to insertion positions outside XML blocks.
---Existing lb-xnai nodes separate narrative fragments, including inline nodes.
---@param text string
---@return string input
---@return string output
---@return fun(text: string): string restore
local function buildSlotMap(text)
  local parts = {}
  local spans = {}
  local saved = {}
  local masked = {}
  local maskedLength = 0
  local visibleLength = 0
  local position = 1
  local lastPos = 1

  local function appendText(first, last)
    if first > last then
      return
    end
    local part = text:sub(first, last)
    parts[#parts + 1] = part
    masked[#masked + 1] = part
    spans[#spans + 1] = {
      finish = visibleLength + #part,
      offset = maskedLength - visibleLength,
    }
    maskedLength = maskedLength + #part
    visibleLength = visibleLength + #part
  end

  while true do
    local tagStart = text:find('<', position, true)
    if not tagStart then
      break
    end
    local tagEnd = text:find('>', tagStart, true)
    if not tagEnd then
      break
    end
    local content = text:sub(tagStart + 1, tagEnd - 1)
    local name = prelude.extractTagName(content)
    local nodeEnd = nil
    if name then
      if content:match('/%s*$') then
        nodeEnd = tagEnd
      else
        local _, closeEnd = text:find('</' .. prelude.escMatch(name) .. '>', tagEnd + 1)
        nodeEnd = closeEnd
      end
    end
    if nodeEnd then
      appendText(lastPos, tagStart - 1)
      saved[#saved + 1] = text:sub(tagStart, nodeEnd)
      local marker = '\0XMLR_' .. #saved .. '\0'
      masked[#masked + 1] = marker
      maskedLength = maskedLength + #marker
      if name == 'lb-xnai' then
        parts[#parts + 1] = '\n'
        spans[#spans + 1] = {
          finish = visibleLength + 1,
          offset = maskedLength - visibleLength - 1,
        }
        visibleLength = visibleLength + 1
      end
      lastPos = nodeEnd + 1
      position = lastPos
    else
      position = tagEnd + 1
    end
  end
  appendText(lastPos, #text)

  text = table.concat(masked)
  local visible = table.concat(parts)
  local first, trimmed, last = visible:match('^%s*()(.-)()%s*$')
  local output = {}
  local originalPos = 1
  local spanIndex = 1
  local slotIndex = 0
  local searchPos = first
  while searchPos < last do
    local startNL, endNL = visible:find('\n+', searchPos)
    if not startNL or endNL >= last then
      break
    end
    while spans[spanIndex].finish < endNL do
      spanIndex = spanIndex + 1
    end
    local originalEnd = endNL + spans[spanIndex].offset
    local chunk = text:sub(originalPos, originalEnd)
    chunk = chunk:gsub('\n\n\n+$', '\n\n')
    output[#output + 1] = chunk
    output[#output + 1] = '<slot num="' .. slotIndex .. '"/>\n\n'
    originalPos = originalEnd + 1
    slotIndex = slotIndex + 1
    searchPos = endNL + 1
  end
  output[#output + 1] = text:sub(originalPos)
  local function restore(value)
    return (value:gsub('\0XMLR_(%d+)\0', function(index)
      return saved[tonumber(index)]
    end))
  end
  return insertSlots(trimmed), table.concat(output), restore
end

---@param triggerId string
---@param text string
---@return string input
---@return string output
---@return fun(text: string): string restore
local function buildContextSlotMap(triggerId, text)
  if getGlobalVar(triggerId, 'toggle_lightboard.preserveXML') ~= '1' then
    return buildSlotMap(text)
  end

  local thoughtValues = {}
  local thoughts = prelude.queryNodes('Thoughts', text)
  for index = #thoughts, 1, -1 do
    local node = thoughts[index]
    thoughtValues[index] = text:sub(node.rangeStart, node.rangeEnd)
    text = text:sub(1, node.rangeStart - 1) .. '\0XNAIT_' .. tostring(index) .. '\0' .. text:sub(node.rangeEnd + 1)
  end

  local saved = {}
  local function mask(value)
    saved[#saved + 1] = value
    return '\0XNAIR_' .. tostring(#saved) .. '\0'
  end

  local masked = text:gsub('%[LBDATA START%].-%[LBDATA END%]', mask)
  local xnaiNodes = prelude.queryNodes('lb-xnai', masked)
  for index = #xnaiNodes, 1, -1 do
    local node = xnaiNodes[index]
    masked = masked:sub(1, node.rangeStart - 1)
        .. mask(masked:sub(node.rangeStart, node.rangeEnd))
        .. masked:sub(node.rangeEnd + 1)
  end
  masked = masked:gsub('<[^>]+>', mask)
  masked = masked:gsub('\0XNAIT_(%d+)\0', '<XNAIThoughtRef index="%1" />')

  local _, slotted, restoreNodes = buildSlotMap(masked)
  local function restoreMasked(value)
    local restored = restoreNodes(value)
    return (restored:gsub('\0XNAIR_(%d+)\0', function(index)
      return saved[tonumber(index)]
    end))
  end
  local function replaceThoughtRefs(value, keepThoughts)
    local function replacement(index)
      return keepThoughts and thoughtValues[tonumber(index)] or ''
    end

    value = value:gsub('<XNAIThoughtRef index="(%d+)" />', replacement)
    return (value:gsub('\0XNAIT_(%d+)\0', replacement))
  end
  local function restore(value)
    return replaceThoughtRefs(restoreMasked(value), true)
  end

  return replaceThoughtRefs(restoreMasked(slotted), false), slotted, restore
end

local inputSlots = {}

---@param tid string
---@param input string
local function setInputSlots(tid, input)
  inputSlots[tid] = input
end

---@param tid string
---@param scenes XNAIDescriptor[]?
---@param slotted string?
---@return string[] errors
local function validateSceneSlots(tid, scenes, slotted)
  local source = slotted or inputSlots[tid] or ''
  local available = {}
  for slot in source:gmatch('<slot num="(%d+)"/>') do
    available[tonumber(slot)] = true
  end
  for _, node in ipairs(prelude.queryNodes('lb-xnai', source)) do
    local slot = tonumber(node.attributes.scene)
    if slot then
      available[slot] = true
    end
  end

  local errors = {}
  local used = {}
  for index, scene in ipairs(scenes or {}) do
    if type(scene) == 'table' then
      local slot = scene.slot
      if slot == nil then
        errors[#errors + 1] = '모델이 장면 ' .. index .. '번의 삽입 위치를 응답하지 않았습니다. 검열 또는 프로바이더 오류일 수 있습니다. 다시 시도해 주세요.'
      elseif not available[slot] then
        errors[#errors + 1] = '현재 채팅에 장면 ' .. index .. '번을 넣을 위치가 없습니다. 다시 생성해 주세요.'
      elseif used[slot] then
        errors[#errors + 1] = '장면 두 개가 같은 위치에 들어가려고 시도했습니다. 다시 생성해 주세요.'
      else
        used[slot] = true
        scene.slot = math.floor(slot)
      end
    end
  end
  return errors
end

---@param slotA string
---@param slotB string
---@return boolean
local function sortSlots(slotA, slotB)
  local numA = tonumber(slotA)
  local numB = tonumber(slotB)

  if numA and numB then
    return numA < numB
  end

  return tostring(slotA) < tostring(slotB)
end

---@param xnaiState XNAIStackItem[]
---@return string
local function buildCharacterHistory(xnaiState)
  local historyMap = {}
  local orderedKeys = {}

  ---@param character XNAIPromptSet
  ---@param meta { chatIndex: number, source: 'keyvis'|'scene', slot?: string }
  local function collect(character, meta)
    if type(character) ~= 'table' then
      return
    end

    local name = trimText(character.name)
    local positive = trimText(character.positive)
    local negative = trimText(character.negative)

    if name == '' then
      return
    end

    local record = historyMap[name]

    if not record then
      record = {
        name = name,
        outputs = {},
        chatIndexMap = {},
      }

      historyMap[name] = record
      table.insert(orderedKeys, name)
    end

    local outputItem = {
      chatIndex = meta.chatIndex,
      source = meta.source,
      positive = positive,
    }
    if meta.slot ~= nil then
      outputItem.slot = meta.slot
    end
    outputItem.name = name
    if negative ~= '' then
      outputItem.negative = negative
    end

    local chatKey = tostring(meta.chatIndex)
    local existingIndex = record.chatIndexMap[chatKey]
    if existingIndex then
      local existingOutput = record.outputs[existingIndex]
      local existingLen = #(existingOutput.positive or '')
      local newLen = #(outputItem.positive or '')

      if newLen > existingLen then
        record.outputs[existingIndex] = outputItem
      end
      return
    end

    table.insert(record.outputs, outputItem)
    record.chatIndexMap[chatKey] = #record.outputs
  end

  ---@param desc XNAIDescriptor?
  ---@param meta { chatIndex: number, source: 'keyvis'|'scene', slot?: string }
  local function collectDescriptor(desc, meta)
    if type(desc) ~= 'table' then
      return
    end

    for _, character in ipairs(desc.characters or {}) do
      collect(character, meta)
    end

    for _, panel in ipairs(desc.panels or {}) do
      collectDescriptor(panel, meta)
    end
  end

  for _, stackItem in ipairs(xnaiState or {}) do
    if type(stackItem) == 'table' and type(stackItem.data) == 'table' then
      if stackItem.data.keyvis then
        collectDescriptor(stackItem.data.keyvis, {
          chatIndex = stackItem.chatIndex,
          source = 'keyvis',
          slot = '-1',
        })
      end

      local sceneSlots = {}
      for slot, _ in pairs(stackItem.data.scenes or {}) do
        table.insert(sceneSlots, slot)
      end
      table.sort(sceneSlots, sortSlots)

      for _, slot in ipairs(sceneSlots) do
        collectDescriptor(stackItem.data.scenes[slot], {
          chatIndex = stackItem.chatIndex,
          source = 'scene',
          slot = slot,
        })
      end
    end
  end

  local history = {}
  for _, key in ipairs(orderedKeys) do
    local record = historyMap[key]
    table.insert(history, '### ' .. record.name .. '')

    for _, output in ipairs(record.outputs) do
      table.insert(history, '')
      table.insert(history, '[Log #' .. tostring(output.chatIndex) .. ']')
      table.insert(history, output.positive or '')
    end

    table.insert(history, '')
  end

  return prelude.trim(table.concat(history, '\n'))
end

---@param triggerId string
---@param xnaiState XNAIStackItem[]
---@return XNAIStackItem[], string
local function persistStateAndHistory(triggerId, xnaiState)
  local safeState = type(xnaiState) == 'table' and xnaiState or {}
  local maxSaves = math.max(1, math.floor(tonumber(getGlobalVar(triggerId, 'toggle_lb-xnai.maxSaves')) or 3))

  while #safeState > maxSaves do
    table.remove(safeState, 1)
  end

  local history = buildCharacterHistory(safeState)
  setState(triggerId, 'lb-xnai-stack', safeState)
  setChatVar(triggerId, 'lb-xnai-history', history)

  prelude.verbose(triggerId, 'lb-xnai.gen',
    'State persisted. entries=' .. tostring(#safeState) .. ', historyLength=' .. tostring(#history))

  return safeState, history
end

---@class XNAIGen
---@field attenuatePrompt fun (input: string, factor?: number): string
---@field buildContextSlotMap fun (triggerId: string, text: string): string, string, fun(text: string): string
---@field buildPresetPrompt fun (triggerId: string, desc: XNAIDescriptor): ImagePromptSet?
---@field buildRawPrompt fun (triggerId: string, desc: XNAIDescriptor): XNAIPromptSet
---@field buildSlotMap fun (text: string): string, string, fun(text: string): string
---@field cleanDescriptionBlocks fun (text: string): string
---@field generate fun (triggerId: string, desc: XNAIDescriptor): string?
---@field insertSlots fun (text: string): string
---@field locateTargetChat fun (fullChat: Chat[]): number?
---@field persistStateAndHistory fun (triggerId: string, xnaiState: XNAIStackItem[]): XNAIStackItem[], string
---@field setInputSlots fun (tid: string, input: string)
---@field validateSceneSlots fun (tid: string, scenes: XNAIDescriptor[]?, slotted: string?): string[]

return {
  attenuatePrompt = attenuatePrompt,
  buildContextSlotMap = buildContextSlotMap,
  buildPresetPrompt = buildPresetPrompt,
  buildRawPrompt = buildRawPrompt,
  buildSlotMap = buildSlotMap,
  cleanDescriptionBlocks = cleanDescriptionBlocks,
  generate = generate,
  insertSlots = insertSlots,
  locateTargetChat = locateTargetChat,
  persistStateAndHistory = persistStateAndHistory,
  setInputSlots = setInputSlots,
  validateSceneSlots = validateSceneSlots,
}
