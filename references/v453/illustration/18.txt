local fullChatCache = nil
local targetIndexCache = nil

local function verbose(tid, ...)
  prelude.verbose(tid, 'lb-xnai.onInput', ...)
end

---@param tid string
---@param input string
---@param meta { index: number, type: 'generation'|'interaction'|'reroll' }
local function main(tid, input, meta)
  verbose(tid, 'Processing chat. index=' .. tostring(meta.index) .. ', type=' .. tostring(meta.type))

  if not fullChatCache then
    fullChatCache = getFullChat(tid)
    verbose(tid, 'Full chat cached. count=' .. tostring(#fullChatCache))
  end

  ---@type XNAIGen
  local gen = prelude.import(tid, 'lb-xnai.gen')

  local lazy = getGlobalVar(tid, 'toggle_lb-xnai.lazy') or '0'
  if lazy == '0' and meta.type == 'generation' then
    local fullChatLength = #fullChatCache
    if meta.index == fullChatLength then
      input = gen.buildContextSlotMap(tid, input)
      gen.setInputSlots(tid, input)
      verbose(tid, 'Inserted slots into the latest generation chat.')
    end
  else
    if not targetIndexCache then
      targetIndexCache = gen.locateTargetChat(fullChatCache)
    end
    if meta.index == targetIndexCache + 1 --[[JS to Lua index]] then
      input = gen.buildContextSlotMap(tid, input)
      gen.setInputSlots(tid, input)
      verbose(tid, 'Inserted slots into the target chat. targetIndex=' .. tostring(targetIndexCache))
    end
  end

  return input
end

return main
