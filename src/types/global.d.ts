interface Window {
  MonacoEnvironment?: {
    getWorker: (id: unknown, label: string) => Worker;
  };
}
