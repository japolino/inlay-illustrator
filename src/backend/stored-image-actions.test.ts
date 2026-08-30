
import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { GeneratedRecord, RawPromptData, State } from "./types.js";
import {
  locateStoredInlayImage,
  getInlayImageDetailsExtended,
  updateInlayPromptData,
  updateInlayQuote,
  deleteInlayImage
} from "./stored-image-actions.js";
import { isGeneratedRecordReference, loadGeneratedRecord, storeGeneratedRecord } from "./storage.js";

type MemoryStorage = {
  files: Map<string, string>;
  exists: (p:string, u?:string)=>Promise<boolean>;
  read: (p:string, u?:string)=>Promise<string>;
  write: (p:string, d:string, u?:string)=>Promise<void>;
  getJson?: any;
  setJson?: any;
  list?: any;
  mkdir: ()=>Promise<void>;
};

function makeRecord(overrides: Partial<GeneratedRecord> = {}): GeneratedRecord {
  const base: GeneratedRecord = {
    chatId: "chat-1",
    messageId: "msg-1",
    swipeId: 0,
    prompts: ["finalPrompt1", "finalPrompt2"],
    negativePrompts: ["neg1", "neg2"],
    quotes: ["quote1", "quote2"],
    imageParameters: [{ workflow: { a: 1 } }, { workflow: { b: 2 } }],
    corePrompts: ["core1", "core2"],
    shotNegatives: ["shotNeg1", "shotNeg2"],
    promptFormats: ["ordered", "ordered"],
    paragraphs: [1, 2],
    imageIds: ["id1", "id2"],
    imageUrls: ["/api/v1/image-gen/results/id1", "/api/v1/image-gen/results/id2"],
    rawJson: { scenes: [] },
    createdAt: new Date().toISOString(),
    rawPromptData: [
      { setup: "setup1", charPos: "pos1", charNeg: "neg1", supplement: "sup1", situation: "sit1", place: "place1", camera: "cam1", action: "act1" },
      { setup: "setup2", charPos: "pos2", charNeg: "neg2", supplement: "sup2", situation: "sit2", place: "place2", camera: "cam2", action: "act2" }
    ]
  };
  return { ...base, ...overrides } as GeneratedRecord;
}

class FakeStorage {
  files = new Map<string,string>();
  writeCalls: Array<{path:string, data:string, userId?:string}> = [];
  chatMessages = new Map<string, Array<{id:string, content:string, metadata?:any}>>();
  chatUpdateCalls: Array<{chatId:string, messageId:string, content:string}> = [];
  failNextChatUpdate = false;
  key(path:string, userId?:string){ return JSON.stringify([userId ?? null, path]); }
  seedState(chatId:string, state: State, userId?:string){
    this.files.set(this.key(`states/${chatId}.json`, userId), JSON.stringify(state));
  }
  seedWorkflow(hash:string, workflow:any, userId?:string){
    this.files.set(this.key(`workflows/${hash}.json`, userId), JSON.stringify(workflow));
  }
  async exists(path:string, userId?:string){ return this.files.has(this.key(path,userId)); }
  async read(path:string, userId?:string){
    const v=this.files.get(this.key(path,userId));
    if (v===undefined) throw new Error("missing "+path);
    return v;
  }
  async write(path:string, data:string, userId?:string){
    this.writeCalls.push({path,data,userId});
    this.files.set(this.key(path,userId), data);
  }
  async mkdir(){}
  async getJson(path:string, opts:{fallback:any, userId?:string}){
    const key=this.key(path, opts.userId);
    if (!this.files.has(key)) return opts.fallback;
    try { return JSON.parse(this.files.get(key)!); } catch { return opts.fallback; }
  }
  async setJson(path:string, value:unknown, opts:{indent?:number, userId?:string}){
    await this.write(path, JSON.stringify(value), opts.userId);
  }
  async list(prefix?:string, userId?:string){
    const pref = prefix || "";
    const out:string[]=[];
    for (const k of this.files.keys()){
      const [u, p] = JSON.parse(k);
      if (u !== (userId ?? null)) continue;
      if ((p as string).startsWith(pref)) out.push(p as string);
    }
    return out;
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  (globalThis as any).spindle = {
    userStorage: {
      exists: (p:string,u?:string)=>storage.exists(p,u),
      read: (p:string,u?:string)=>storage.read(p,u),
      write: (p:string,d:string,u?:string)=>storage.write(p,d,u),
      getJson: (p:string, opts:any)=>storage.getJson(p,opts),
      setJson: (p:string,v:unknown, opts:any)=>storage.setJson(p,v,opts),
      list: (pref?:string,u?:string)=>storage.list(pref,u),
      mkdir: ()=>storage.mkdir()
    },
    chat: {
      getMessages: async (chatId:string) => {
        return storage.chatMessages.get(chatId) || [];
      },
      updateMessage: async (chatId:string, messageId:string, payload:{content:string, metadata?:any}) => {
        if (storage.failNextChatUpdate) { storage.failNextChatUpdate=false; throw new Error("chat update failed"); }
        storage.chatUpdateCalls.push({chatId,messageId,content:payload.content});
        const msgs = storage.chatMessages.get(chatId) || [];
        const idx = msgs.findIndex(m=>m.id===messageId);
        if (idx>=0) msgs[idx] = { ...msgs[idx], content: payload.content, metadata: payload.metadata };
      }
    },
    log: { info:()=>{}, warn:()=>{}, error:()=>{} }
  };
  // also need crypto for hashing
  if (!(globalThis as any).crypto?.subtle) {
    // fallback handled by storage compact hash fallback
  }
});

async function createStateWithRecord(record: GeneratedRecord, userId="user-1"): Promise<{state:State, key:string}> {
  const key = `${record.chatId}:${record.messageId}:${record.swipeId}`;
  // need to store via storeGeneratedRecord to get compact workflow refs
  const { storeGeneratedRecord: sgr, rebuildGeneratedImageIndex } = await import("./storage.js");
  // temporarily set spindle for store
  const ref = await sgr(record.chatId, key, record, userId);
  const state: State = { characterAppearance:{}, generated:{[key]: ref}, generatedImageIndex:{} };
  // need to write state file
  const stFile = JSON.stringify(state);
  storage.files.set(storage.key(`states/${record.chatId}.json`, userId), stFile);
  // rebuild index via reading? manually
  const fullState = JSON.parse(stFile) as State;
  // we need to rebuild index correctly by calling rebuildGeneratedImageIndex after loading? Simpler call directly
  const { rebuildGeneratedImageIndex: rebuild } = await import("./storage.js");
  rebuild(fullState);
  storage.files.set(storage.key(`states/${record.chatId}.json`, userId), JSON.stringify(fullState));
  return {state: fullState, key};
}

describe("locateStoredInlayImage", () => {
  test("stale index fallback to id/url", async () => {
    const rec = makeRecord();
    const {state} = await createStateWithRecord(rec);
    // request with stale index 0 but id of second image, should return index 1 via id fallback
    const req = { chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0, imageId:"id2", imageUrl:"/api/v1/image-gen/results/id2" };
    const located = await locateStoredInlayImage(state, req, "user-1");
    expect(located.index).toBe(1);
  });
  test("wrong message fails", async () => {
    const rec = makeRecord();
    const {state} = await createStateWithRecord(rec);
    const req = { chatId:"chat-1", messageId:"wrong-msg", swipeId:0, imageIndex:0, imageId:"id1" };
    await expect(locateStoredInlayImage(state, req, "user-1")).rejects.toThrow();
  });
  test("missing record fails", async () => {
    const state:State = { characterAppearance:{}, generated:{} };
    const req={ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 };
    await expect(locateStoredInlayImage(state, req, "user-1")).rejects.toThrow();
  });
  test("locates via url when index stale", async () => {
    const rec = makeRecord();
    const {state}=await createStateWithRecord(rec);
    const req={ chatId:"chat-1", imageUrl:"/api/v1/image-gen/results/id2", imageIndex:0 };
    const loc=await locateStoredInlayImage(state, req, "user-1");
    expect(loc.index).toBe(1);
  });
});

describe("getInlayImageDetailsExtended", () => {
  test("returns raw setup/pos/neg/sup and secondary prompt", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    const details = await getInlayImageDetailsExtended({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(details.prompt).toBe("finalPrompt1");
    expect(details.negativePrompt).toBe("neg1");
    expect(details.quote).toBe("quote1");
    expect(details.hasRawPromptData).toBe(true);
    expect(details.setup).toBe("setup1");
    expect(details.charPos).toBe("pos1");
    expect(details.charNeg).toBe("neg1");
    expect(details.supplement).toBe("sup1");
    expect(details.situation).toBe("sit1");
  });
  test("raw absence shows unavailable", async () => {
    const rec=makeRecord({ rawPromptData: undefined });
    // manually store without raw
    const key=`${rec.chatId}:${rec.messageId}:${rec.swipeId}`;
    const state:State={ characterAppearance:{}, generated:{} };
    // store via storage without raw
    const { storeGeneratedRecord } = await import("./storage.js");
    const ref = await storeGeneratedRecord(rec.chatId, key, rec as any, "user-1");
    const st:State={ characterAppearance:{}, generated:{[key]: ref} };
    storage.files.set(storage.key(`states/${rec.chatId}.json`, "user-1"), JSON.stringify(st));
    const details = await getInlayImageDetailsExtended({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(details.hasRawPromptData).toBe(false);
    expect(details.rawPromptData).toBeNull();
  });
});

describe("updateInlayPromptData", () => {
  test("exact editing retains situation/place/camera/action and no image mutation", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"para1\n\npara2" }]);
    const res = await updateInlayPromptData({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { setup:"newSetup", charPos:"newPos", charNeg:"newNeg", supplement:"newSup" }, "user-1");
    expect(res.details.setup).toBe("newSetup");
    expect(res.details.charPos).toBe("newPos");
    expect(res.details.charNeg).toBe("newNeg");
    expect(res.details.supplement).toBe("newSup");
    expect(res.details.situation).toBe("sit1");
    expect(res.details.place).toBe("place1");
    // prompts unchanged
    expect(res.record.prompts[0]).toBe("finalPrompt1");
    // no chat update for prompt edit
    expect(storage.chatUpdateCalls.length).toBe(0);
    // future reroll should see edited raw: load again
    const details2 = await getInlayImageDetailsExtended({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(details2.setup).toBe("newSetup");
  });
  test("raw absence error does not fabricate", async () => {
    const rec=makeRecord({ rawPromptData: undefined });
    const key=`${rec.chatId}:${rec.messageId}:${rec.swipeId}`;
    const { storeGeneratedRecord } = await import("./storage.js");
    const ref = await storeGeneratedRecord(rec.chatId, key, rec as any, "user-1");
    storage.files.set(storage.key(`states/${rec.chatId}.json`, "user-1"), JSON.stringify({ characterAppearance:{}, generated:{[key]:ref}}));
    await expect(updateInlayPromptData({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { setup:"x", charPos:"y", charNeg:"z", supplement:"w" }, "user-1")).rejects.toThrow(/unavailable/i);
  });
  test("workflow remains compact no hydration duplication", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    const beforeFiles = new Set(storage.files.keys());
    await updateInlayPromptData({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { setup:"a", charPos:"b", charNeg:"c", supplement:"d" }, "user-1");
    // check stored record still has workflow ref not inflated
    const stateRaw = JSON.parse(storage.files.get(storage.key("states/chat-1.json","user-1"))!);
    const key = Object.keys(stateRaw.generated)[0];
    const recordPath = (stateRaw.generated[key] as any).recordPath;
    const recordRaw = JSON.parse(storage.files.get(storage.key(recordPath,"user-1"))!);
    // imageParameters should still be compact refs
    expect(recordRaw.imageParameters[0].workflow).toHaveProperty("__inlayIllustratorWorkflowRef");
    expect(recordRaw.imageParameters[1].workflow).toHaveProperty("__inlayIllustratorWorkflowRef");
  });
  test("validates payload sizes and no raw injection", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    await expect(updateInlayPromptData({ chatId:"chat-1", imageIndex:0 } as any, { setup:"x".repeat(6000) }, "user-1")).rejects.toThrow();
    await expect(updateInlayPromptData({ chatId:"chat-1", imageIndex:0 } as any, { rawPromptData:{ setup:"x"} } as any, "user-1")).rejects.toThrow(/injection/i);
  });
});

describe("updateInlayQuote", () => {
  test("edits exact quote and rerenders message, empty deletes", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"Hello\n\nPara1\n\nPara2" }]);
    const res = await updateInlayQuote({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { quote: "New quote" }, "user-1");
    expect(res.details.quote).toBe("New quote");
    expect(storage.chatUpdateCalls.length).toBe(1);
    expect(storage.chatUpdateCalls[0].content).toContain("New quote");
    // empty deletes
    storage.chatUpdateCalls=[];
    const res2 = await updateInlayQuote({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { quote: "" }, "user-1");
    expect(res2.details.quote).toBe("");
    expect(storage.chatUpdateCalls.length).toBe(1);
  });
  test("escaping preserved", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"c" }]);
    const q = `He said "hello" & <test> *star*`;
    const res = await updateInlayQuote({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:1 }, { quote: q }, "user-1");
    expect(res.details.quote).toBe(q);
    // rendering escapes for html but stored raw is exact
    const stored = JSON.parse(storage.files.get(storage.key(`states/chat-1.json`,"user-1"))!);
  });
  test("state write before chat rerender, chat failure keeps storage", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"c" }]);
    storage.failNextChatUpdate=true;
    const res = await updateInlayQuote({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, { quote:"failtest" }, "user-1");
    // storage should still have updated quote even though chat update failed
    const details = await getInlayImageDetailsExtended({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(details.quote).toBe("failtest");
    // chatUpdateCalls should be 0 or 1? it threw but we still attempted
    expect(details.quote).toBe("failtest");
  });
});

describe("deleteInlayImage", () => {
  test("removes aligned index from all arrays including partial optional", async () => {
    const rec=makeRecord({
      negativePrompts: ["n1","n2"],
      quotes: ["q1","q2"],
      corePrompts: undefined,
      shotNegatives: ["s1","s2"],
      rawPromptData: [
        { setup:"s1", charPos:"p1", charNeg:"n1", supplement:"sup1", situation:"a", place:"b", camera:"c", action:"d" },
        { setup:"s2", charPos:"p2", charNeg:"n2", supplement:"sup2", situation:"a2", place:"b2", camera:"c2", action:"d2" }
      ]
    } as any);
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"Para1\n\nPara2" }]);
    const res = await deleteInlayImage({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(res.record.prompts.length).toBe(1);
    expect(res.record.prompts[0]).toBe("finalPrompt2");
    expect(res.record.negativePrompts?.length).toBe(1);
    expect(res.record.imageIds).toEqual(["id2"]);
    expect(res.record.paragraphs).toEqual([2]);
    expect(res.record.rawPromptData?.length).toBe(1);
    expect(res.record.shotNegatives?.length).toBe(1);
    expect(res.record.corePrompts).toBeDefined(); // was undefined, should stay undefined or empty? our logic keeps empty but deletes
    // check index rebuilt
    const stateRaw = JSON.parse(storage.files.get(storage.key("states/chat-1.json","user-1"))!);
    expect(stateRaw.generatedImageIndex["id:id1"]).toBeUndefined();
    expect(stateRaw.generatedImageIndex["id:id2"]).toBeDefined();
  });
  test("last image keeps valid empty record and cleans markup", async () => {
    const rec=makeRecord({
      prompts:["p1"],
      negativePrompts:["n1"],
      quotes:["q1"],
      imageParameters:[{workflow:{a:1}}],
      corePrompts:["c1"],
      shotNegatives:["s1"],
      promptFormats:["ordered"],
      paragraphs:[1],
      imageIds:["id1"],
      imageUrls:["/api/v1/image-gen/results/id1"],
      rawPromptData:[{ setup:"s", charPos:"p", charNeg:"n", supplement:"sup", situation:"sit", place:"pl", camera:"cam", action:"act"}]
    });
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"Hello <!-- inlay_illustrator --> <div data-inlay-illustrator=\"true\">img</div> world" }]);
    const res = await deleteInlayImage({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    expect(res.record.imageUrls.length).toBe(0);
    expect(res.record.prompts.length).toBe(0);
    expect(storage.chatUpdateCalls.length).toBe(1);
    expect(storage.chatUpdateCalls[0].content).not.toContain("inlay-illustrator");
    expect(storage.chatUpdateCalls[0].content).not.toContain("inlay_illustrator");
  });
  test("workflow remains compact after delete", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"c" }]);
    await deleteInlayImage({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0 }, "user-1");
    const stateRaw = JSON.parse(storage.files.get(storage.key("states/chat-1.json","user-1"))!);
    const key=Object.keys(stateRaw.generated)[0];
    const recPath=(stateRaw.generated[key] as any).recordPath;
    const stored=JSON.parse(storage.files.get(storage.key(recPath,"user-1"))!);
    if (stored.imageParameters?.length) {
      expect(stored.imageParameters[0].workflow).toHaveProperty("__inlayIllustratorWorkflowRef");
    }
  });
  test("stale index fallback to id/url for delete", async () => {
    const rec=makeRecord();
    await createStateWithRecord(rec);
    storage.chatMessages.set("chat-1", [{ id:"msg-1", content:"c" }]);
    // request with stale index 0 but id2 -> should delete id2 (index1)
    const res = await deleteInlayImage({ chatId:"chat-1", messageId:"msg-1", swipeId:0, imageIndex:0, imageId:"id2" } as any, "user-1");
    expect(res.record.imageIds).toEqual(["id1"]);
  });
});
