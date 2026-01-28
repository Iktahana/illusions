"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { StorageAdapter, MockStorageAdapter, NovelDocument } from "./storage-adapter";

interface StorageContextValue {
  adapter: StorageAdapter;
  currentDocument: NovelDocument | null;
  isLoading: boolean;
  saveDocument: (document: NovelDocument) => Promise<void>;
  loadDocument: (documentId: string) => Promise<void>;
  listDocuments: () => Promise<NovelDocument[]>;
}

const StorageContext = createContext<StorageContextValue | undefined>(undefined);

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [adapter] = useState<StorageAdapter>(() => new MockStorageAdapter());
  const [currentDocument, setCurrentDocument] = useState<NovelDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        await adapter.initialize();
        const docs = await adapter.list();
        if (docs.length > 0) {
          setCurrentDocument(docs[0]);
        }
      } catch (error) {
        console.error("Failed to initialize storage:", error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [adapter]);

  const saveDocument = async (document: NovelDocument) => {
    await adapter.save(document);
    setCurrentDocument(document);
  };

  const loadDocument = async (documentId: string) => {
    setIsLoading(true);
    try {
      const doc = await adapter.load(documentId);
      setCurrentDocument(doc);
    } finally {
      setIsLoading(false);
    }
  };

  const listDocuments = async () => {
    return await adapter.list();
  };

  return (
    <StorageContext.Provider
      value={{
        adapter,
        currentDocument,
        isLoading,
        saveDocument,
        loadDocument,
        listDocuments,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage() {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error("useStorage must be used within a StorageProvider");
  }
  return context;
}
