
'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // In development, we want to surface the rich contextual error
      // In production, you might want to log this or show a generic message
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: `Security Rule Violation: Operation '${error.operation}' denied at path '${error.path}'.`,
      });
    };

    errorEmitter.on('permission-error', handlePermissionError);
    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
  }, [toast]);

  return null;
}
