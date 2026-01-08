import type Database from "better-sqlite3";
import { ArtifactsRepo } from "./repos/artifacts";
import { ChatsRepo } from "./repos/chats";
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
  runEvents: RunEventsRepo;
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
    runEvents: new RunEventsRepo(db)
  };
}
