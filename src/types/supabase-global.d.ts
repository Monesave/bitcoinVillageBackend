/**
 * Global type declarations to work around Supabase type inference issues
 * This file extends Supabase types to be more permissive
 */

import '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface PostgrestFilterBuilder<
    T extends { PostgrestVersion: string },
    U,
    V,
    W,
    X extends string,
    Y,
    Z
  > {
    update(values: any, options?: any): this;
    insert(values: any, options?: any): this;
    upsert(values: any, options?: any): this;
  }
}
