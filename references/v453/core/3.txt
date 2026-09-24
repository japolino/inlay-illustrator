---@class ImagePromptSet
---@field negative string?
---@field positive string

---@class ImagePresetSource
---@field characters ImagePromptSet[]
---@field description string
---@field setup string

---@class ImagePresetOptions
---@field characterDivider string?
---@field characterPromptSeparated boolean?
---@field comfy boolean?
---@field inlineSeparator string?
---@field negativeNote string?
---@field positiveNote string?
---@field presetBookName string?
---@field sectionSeparator string?
---@field weightMode 'convert'|'strip'?

---@class ImageGenerationErrors
---@field emptyPositive string?
---@field requestFailed string?

---@param value any
---@return string
local function trimText(value)
  if type(value) ~= 'string' then
    return ''
  end

  return prelude.trim(value)
end

---@param text string
---@param placeholder string
---@param value string
---@return string
local function replacePlaceholder(text, placeholder, value)
  return (text:gsub(prelude.escMatch(placeholder), function()
    return value
  end))
end

---@param triggerId string
---@param source ImagePresetSource
---@param options ImagePresetOptions?
---@return ImagePromptSet?
local function applyImagePreset(triggerId, source, options)
  options = options or {}

  local presetBookName = trimText(options.presetBookName)
  if presetBookName == '' then
    presetBookName = '프리셋 1'
  end

  local presetBook = prelude.getPriorityLoreBook(triggerId, presetBookName)
  if (not presetBook or not presetBook.content or presetBook.content == '') and presetBookName ~= '프리셋 1' then
    presetBook = prelude.getPriorityLoreBook(triggerId, '프리셋 1')
  end

  if not presetBook or not presetBook.content or presetBook.content == '' then
    return nil
  end

  local characterDivider = options.characterDivider or ' | '
  local characters = source.characters or {}
  local comfy = options.comfy == true
  local description = trimText(source.description)
  local inlineSeparator = options.inlineSeparator or ', '
  local negativeNote = trimText(options.negativeNote)
  local positiveNote = trimText(options.positiveNote)
  local sectionSeparator = options.sectionSeparator or ',\n\n'
  local setupPrompt = trimText(source.setup)

  local characterPositive = ''
  local characterNegative = ''
  if #characters > 0 then
    local negativeParts = {}
    local positiveParts = {}

    for _, character in ipairs(characters) do
      local positive = character.positive

      if comfy and options.characterPromptSeparated then
        local rawPositive = trimText(positive)
        if rawPositive ~= '' and not rawPositive:match('^[Tt]he%s+') then
          positive = 'the ' .. rawPositive
        else
          positive = rawPositive
        end
      end

      table.insert(negativeParts, character.negative or '')
      table.insert(positiveParts, positive)
    end

    characterNegative = table.concat(negativeParts, characterDivider)
    characterPositive = table.concat(positiveParts, characterDivider)
  end

  local content = prelude.trim(presetBook.content)
  local positive = content:match('%[Positive%]%s*([%s%S]-)%s*%[Negative%]')
  positive = positive and prelude.trim(positive) or ''

  if positive == '' then
    positive = '{prompt}'
  end
  if not positive:find('{prompt}', 1, true) and not positive:find('{setup}', 1, true) and not positive:find('{description}', 1, true) then
    positive = positive .. ', {prompt}'
  end

  if positive:find('{prompt}', 1, true) then
    local promptBody = setupPrompt
    if positiveNote ~= '' then
      promptBody = promptBody .. inlineSeparator .. positiveNote
    end

    if comfy then
      if characterPositive ~= '' then
        promptBody = promptBody .. sectionSeparator .. characterPositive
      end
      if description ~= '' then
        promptBody = promptBody .. sectionSeparator .. description
      end
      positive = replacePlaceholder(positive, '{prompt}', promptBody)
    else
      if description ~= '' then
        promptBody = promptBody .. sectionSeparator .. description
      end
      positive = replacePlaceholder(positive, '{prompt}', promptBody) .. ' | ' .. characterPositive
    end
  else
    if positive:find('{setup}', 1, true) then
      positive = replacePlaceholder(positive, '{setup}', setupPrompt)
    else
      positive = positive ~= '' and positive .. inlineSeparator .. setupPrompt or setupPrompt
    end

    if comfy then
      if positive:find('{char}', 1, true) then
        positive = replacePlaceholder(positive, '{char}', characterPositive)
      else
        positive = positive ~= '' and positive .. '\n\n' .. characterPositive or characterPositive
      end

      if positive:find('{description}', 1, true) then
        positive = replacePlaceholder(positive, '{description}', description)
      else
        positive = positive .. '\n\n' .. description
      end
    else
      positive = replacePlaceholder(positive, '{char}', '')

      if positive:find('{description}', 1, true) then
        positive = replacePlaceholder(positive, '{description}', description)
      else
        positive = positive .. '\n\n' .. description
      end

      positive = positive .. ' | ' .. characterPositive
    end
  end

  local negative = content:match('%[Negative%]%s*([%s%S]-)%s*$')
  negative = negative and prelude.trim(negative) or ''

  if negative == '' then
    negative = '{prompt}'
  end
  if not negative:find('{prompt}', 1, true) then
    negative = negative .. ', {prompt}'
  end

  if comfy then
    negative = replacePlaceholder(negative, '{prompt}', negativeNote) .. '\n\n' .. characterNegative
  else
    negative = replacePlaceholder(negative, '{prompt}', negativeNote) .. ' | ' .. characterNegative
  end

  positive = positive:gsub('\n\n\n+', '\n\n')
  negative = negative:gsub('\n\n\n+', '\n\n')

  if comfy then
    local naiWeight = '(%-?%d*%.?%d+)::(.-)::'
    if options.weightMode == 'convert' then
      positive = positive:gsub(naiWeight, '(%2:%1)')
      negative = negative:gsub(naiWeight, '(%2:%1)')
    else
      positive = positive:gsub(naiWeight, '%2')
      negative = negative:gsub(naiWeight, '%2')
    end
    positive = positive:gsub('[{}]', ''):gsub('%[', ''):gsub('%]', '')
    negative = negative:gsub('[{}]', ''):gsub('%[', ''):gsub('%]', '')
  else
    positive = positive:gsub('%(', '\\('):gsub('%)', '\\)')
  end

  return {
    negative = negative,
    positive = positive,
  }
end

---@param triggerId string
---@param prompts ImagePromptSet
---@param errors ImageGenerationErrors?
---@return string
local function generateImageFromPrompts(triggerId, prompts, errors)
  errors = errors or {}

  if trimText(prompts.positive) == '' then
    error(errors.emptyPositive or '긍정 이미지 프롬프트가 없습니다.')
  end

  local inlay = generateImage(triggerId, prompts.positive, prompts.negative or ''):await()
  if type(inlay) ~= 'string' or inlay:sub(1, 7) ~= '{{inlay' then
    error(errors.requestFailed or '이미지 생성 API 호출에 실패했습니다.')
  end

  return inlay
end

---@class LightboardImage
---@field applyImagePreset fun(triggerId: string, source: ImagePresetSource, options?: ImagePresetOptions): ImagePromptSet?
---@field generateImageFromPrompts fun(triggerId: string, prompts: ImagePromptSet, errors?: ImageGenerationErrors): string

return {
  applyImagePreset = applyImagePreset,
  generateImageFromPrompts = generateImageFromPrompts,
}
