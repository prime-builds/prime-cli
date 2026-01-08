import type Database from "better-sqlite3";
import { ArtifactsRepo } from "./repos/artifacts";
import { ChatsRepo } from "./repos/chats";
import { DocChunksRepo } from "./repos/doc-chunks";
import { DocsRepo } from "./repos/docs";
import { EvidenceRepo } from "./repos/evidence";
import { MessagesRepo } from "./repos/messages";
import { MissionsRepo } from "./repos/missions";
import { ProjectsRepo } from "./repos/projects";
import { RunEventsRepo } from "./repos/run-events";
import { RunsRepo } from "./repos/runs";
import { StepsRepo } from "./repos/steps";

export interface StorageRepos {
  projects: ProjectsRepo;
  chats: ChatsRepo;
  messages: MessagesRepo;
  missions: MissionsRepo;
  runs: RunsRepo;
  steps: StepsRepo;
  artifacts: ArtifactsRepo;
  evidence: EvidenceRepo;
  runEvents: RunEventsRepo;
  docs: DocsRepo;
  docChunks: DocChunksRepo;
}

export function createRepos(db: Database.Database): StorageRepos {
  return {
    projects: new ProjectsRepo(db),
    chats: new ChatsRepo(db),
    messages: new MessagesRepo(db),
    missions: new MissionsRepo(db),
    runs: new RunsRepo(db),
    steps: new StepsRepo(db),
    artifacts: new ArtifactsRepo(db),
    evidence: new EvidenceRepo(db),
    runEvents: new RunEventsRepo(db),
    docs: new DocsRepo(db),
    docChunks: new DocChunksRepo(db)
  };
}
