export interface AdapterDefinition {
  id: string;
  name: string;
  description?: string;
}

export interface AdapterRegistry {
  list(): AdapterDefinition[];
  get(adapterId: string): AdapterDefinition | undefined;
}

export class EmptyAdapterRegistry implements AdapterRegistry {
  list(): AdapterDefinition[] {
    return [];
  }

  get(_adapterId: string): AdapterDefinition | undefined {
    return undefined;
  }
}

export class StaticAdapterRegistry implements AdapterRegistry {
  private readonly adapters: AdapterDefinition[];

  constructor(adapters: AdapterDefinition[]) {
    this.adapters = adapters;
  }

  list(): AdapterDefinition[] {
    return [...this.adapters];
  }

  get(adapterId: string): AdapterDefinition | undefined {
    return this.adapters.find((adapter) => adapter.id === adapterId);
  }
}
