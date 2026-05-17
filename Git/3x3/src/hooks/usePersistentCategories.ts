import { useEffect, useState } from 'react';

export function usePersistentCategories(key: string, initialValue: string[]) {
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(categories));
  }, [key, categories]);

  return [categories, setCategories] as const;
}
