import { describe, expect, test } from "bun:test";
import { prepareAndDispatchImageJobs, rerollImageParameters } from "./images.js";

const helpers = { prepareAndDispatchImageJobs, rerollImageParameters };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const imageJobs = [
  { index: 0, total: 3, prompt: "first prompt", negative: "", paragraph: 3, parameters: {} },
  { index: 1, total: 3, prompt: "second prompt", negative: "", paragraph: 1, parameters: {} },
  { index: 2, total: 3, prompt: "third prompt", negative: "", paragraph: 2, parameters: {} }
];

describe("image preparation and generation pipeline", () => {
  test("clones ComfyUI parameters, updates selected prompt mappings, and changes mapped seed inputs", () => {
    const originalRandom = Math.random;
    Math.random = () => 41 / 2147483647;
    try {
      const parameters = {
        workflow: {
          "3": { inputs: { seed: 41, cfg: 7 } },
          "7": { inputs: { text: "old positive prefix, sustained scene prompt" } },
          "8": { inputs: { text: "old negative" } }
        },
        workflowFormat: "api_prompt"
      };
      const rerolled = helpers.rerollImageParameters(parameters, {
        id: "comfy",
        name: "ComfyUI",
        provider: "comfyui",
        model: "workflow",
        metadata: {
          comfyui: {
            workflow_api_json: parameters.workflow,
            field_mappings: [
              { nodeId: "3", fieldName: "seed", mappedAs: "seed" },
              { nodeId: "7", fieldName: "text", mappedAs: "positive_prompt" },
              { nodeId: "8", fieldName: "text", mappedAs: "negative_prompt" }
            ]
          }
        }
      }, "new positive prefix, sustained scene prompt", "new negative");

      expect(rerolled).not.toBe(parameters);
      expect(rerolled.seed).toBe(42);
      expect((rerolled.workflow as any)["3"].inputs).toEqual({ seed: 42, cfg: 7 });
      expect((rerolled.workflow as any)["7"].inputs.text).toBe("new positive prefix, sustained scene prompt");
      expect((rerolled.workflow as any)["8"].inputs.text).toBe("new negative");
      expect(parameters.workflow["7"].inputs.text).toBe("old positive prefix, sustained scene prompt");
      expect(parameters.workflow["3"].inputs.seed).toBe(41);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("submits each ComfyUI image as soon as its sequential cleanup completes", async () => {
    const preparations = imageJobs.map(() => deferred<(typeof imageJobs)[number]>());
    const generations = imageJobs.map(() => deferred<{ imageId: string }>());
    const preparing: number[] = [];
    const submitted: number[] = [];
    const events: string[] = [];
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], true, (index) => {
      preparing.push(index);
      events.push(`cleanup ${index}`);
      return preparations[index].promise;
    }, (job) => {
      submitted.push(job.index);
      events.push(`generate ${job.index}`);
      return generations[job.index].promise;
    });

    expect(preparing).toEqual([0]);
    expect(submitted).toEqual([]);

    preparations[0].resolve(imageJobs[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1]);
    expect(events).toEqual(["cleanup 0", "generate 0", "cleanup 1"]);

    preparations[1].resolve(imageJobs[1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1]);
    expect(preparing).toEqual([0, 1, 2]);

    preparations[2].resolve(imageJobs[2]);
    generations[2].resolve({ imageId: "third" });
    generations[0].resolve({ imageId: "first" });
    generations[1].resolve({ imageId: "second" });

    const { jobs, results } = await completed;
    expect(jobs.map((job) => job.index)).toEqual([0, 1, 2]);
    expect(results.map((result) => result.imageId)).toEqual(["first", "second", "third"]);
  });

  test("overlaps later cleanup with generation while keeping non-ComfyUI requests serial", async () => {
    const preparations = imageJobs.map(() => deferred<(typeof imageJobs)[number]>());
    const generations = imageJobs.map(() => deferred<string>());
    const preparing: number[] = [];
    const submitted: number[] = [];
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], false, (index) => {
      preparing.push(index);
      return preparations[index].promise;
    }, (job) => {
      submitted.push(job.index);
      return generations[job.index].promise;
    });

    preparations[0].resolve(imageJobs[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1]);

    preparations[1].resolve(imageJobs[1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1, 2]);

    preparations[2].resolve(imageJobs[2]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);

    generations[0].resolve("first");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1]);
    generations[1].resolve("second");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1, 2]);
    generations[2].resolve("third");

    await expect(completed).resolves.toEqual({ jobs: imageJobs, results: ["first", "second", "third"] });
  });

  test("waits for every eagerly submitted job and preserves successful siblings", async () => {
    const generations = imageJobs.map(() => deferred<string>());
    const submitted: number[] = [];
    const failure = new Error("first job failed");
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], true, (index) => imageJobs[index], (job) => {
      submitted.push(job.index);
      return generations[job.index].promise;
    });
    let settled = false;
    void completed.then(() => { settled = true; });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1, 2]);
    generations[0].reject(failure);
    generations[1].resolve("second");
    await Promise.resolve();
    expect(settled).toBe(false);
    generations[2].resolve("third");

    await expect(completed).resolves.toEqual({
      jobs: [imageJobs[1], imageJobs[2]],
      results: ["second", "third"]
    });
  });

  test("preserves a submitted success after a later preparation failure", async () => {
    const generation = deferred<string>();
    const preparationFailure = new Error("second cleanup failed");
    const completed = helpers.prepareAndDispatchImageJobs([0, 1], true, (index) => {
      if (index === 1) throw preparationFailure;
      return imageJobs[index];
    }, () => generation.promise);
    let settled = false;
    void completed.then(() => { settled = true; });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    generation.resolve("first");

    await expect(completed).resolves.toEqual({ jobs: [imageJobs[0]], results: ["first"] });
  });

  test("continues serial providers after a failed image and preserves later successes", async () => {
    const submitted: number[] = [];
    const failure = new Error("second job failed");

    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], false, (index) => imageJobs[index], async (job) => {
      submitted.push(job.index);
      if (job.index === 1) throw failure;
      return `image-${job.index}`;
    });

    await expect(completed).resolves.toEqual({
      jobs: [imageJobs[0], imageJobs[2]],
      results: ["image-0", "image-2"]
    });
    expect(submitted).toEqual([0, 1, 2]);
  });

  test("still rejects when every submitted image fails", async () => {
    const firstFailure = new Error("first job failed");
    const completed = helpers.prepareAndDispatchImageJobs([0, 1], true, (index) => imageJobs[index], async (job) => {
      throw job.index === 0 ? firstFailure : new Error("second job failed");
    });

    await expect(completed).rejects.toBe(firstFailure);
  });

  test("reports eager results as each Promise settles without rearranging the final batch", async () => {
    const generations = imageJobs.map(() => deferred<string>());
    const progressive: string[] = [];
    const completed = helpers.prepareAndDispatchImageJobs(
      [0, 1, 2],
      true,
      (index) => imageJobs[index],
      (job) => generations[job.index].promise,
      {
        onSettled: (job, result) => {
          progressive.push(`${job.index}:${result.status}`);
        }
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    generations[2].resolve("third");
    await Promise.resolve();
    generations[0].resolve("first");
    await Promise.resolve();
    generations[1].resolve("second");

    await expect(completed).resolves.toEqual({ jobs: imageJobs, results: ["first", "second", "third"] });
    expect(progressive).toEqual(["2:fulfilled", "0:fulfilled", "1:fulfilled"]);
  });

  test("cancellation prevents later serial provider submissions", async () => {
    const controller = new AbortController();
    const first = deferred<string>();
    const submitted: number[] = [];
    const settled: string[] = [];
    const completed = helpers.prepareAndDispatchImageJobs(
      [0, 1],
      false,
      (index) => imageJobs[index],
      (job) => {
        submitted.push(job.index);
        return first.promise;
      },
      {
        signal: controller.signal,
        onSettled: (job, result) => { settled.push(`${job.index}:${result.status}`); }
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    first.resolve("first");
    await expect(completed).resolves.toEqual({ jobs: [imageJobs[0]], results: ["first"] });
    expect(submitted).toEqual([0]);
    expect(settled).toEqual(["0:fulfilled", "1:rejected"]);
  });

  test("cooperative cancellation can stop waiting for already-submitted provider work", async () => {
    const controller = new AbortController();
    const generations = imageJobs.slice(0, 2).map(() => deferred<string>());
    const completed = helpers.prepareAndDispatchImageJobs(
      [0, 1],
      true,
      (index) => imageJobs[index],
      (job) => generations[job.index].promise,
      { signal: controller.signal, stopWaitingOnAbort: true }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(completed).rejects.toHaveProperty("name", "AbortError");
    generations[0].resolve("ignored-first");
    generations[1].resolve("ignored-second");
  });
});

