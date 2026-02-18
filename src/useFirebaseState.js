import { useState, useEffect, useRef, useCallback } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "./firebase";

/**
 * Custom hook that syncs a piece of state with Firebase Realtime Database.
 *
 * @param {string} path - Firebase path (e.g. "consumption")
 * @param {*} defaultValue - Default value if nothing exists in Firebase yet
 * @param {object} options
 * @param {number} options.debounce - Debounce delay in ms for writes (0 = immediate)
 * @returns {[any, function, boolean]} - [value, setValue, loading]
 */
export function useFirebaseState(path, defaultValue, { debounce = 0 } = {}) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const isInitialLoad = useRef(true);
  const fbRef = ref(db, path);

  // Listen for real-time updates from Firebase
  useEffect(() => {
    const unsubscribe = onValue(fbRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        setValue(data);
      } else if (isInitialLoad.current) {
        // First load and nothing in Firebase — seed it with defaults
        set(fbRef, defaultValue);
      }
      isInitialLoad.current = false;
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Write to Firebase (with optional debounce)
  const setAndSync = useCallback(
    (updater) => {
      setValue((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;

        if (debounce > 0) {
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => set(fbRef, next), debounce);
        } else {
          set(fbRef, next);
        }

        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, debounce]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return [value, setAndSync, loading];
}
