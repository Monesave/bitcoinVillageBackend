# Fixing Supabase Type Errors

## Problem
Supabase's TypeScript types sometimes infer `never` for query results, causing errors like:
- `Property 'user_id' does not exist on type 'never'`
- `Argument of type 'any' is not assignable to parameter of type 'never'`

## Solutions

### 1. Always Cast Query Results (Recommended)
After any Supabase query, immediately cast the result:

```typescript
const { data: result } = await supabase.from('table').select('*').single();
const typedResult = result as any; // or create a proper interface
```

### 2. Use @ts-ignore for Update/Insert Operations
For `.update()` and `.insert()` calls, add `@ts-ignore` before the method:

```typescript
await supabase
  .from('table')
  // @ts-ignore - Supabase type inference issue
  .update({ field: value } as any)
  .eq('id', id);
```

### 3. Type Assertions on Data Objects
When accessing properties from Supabase results:

```typescript
const data = result as any;
// Now you can safely access data.user_id, data.property, etc.
```

## Quick Fix Pattern

For any Supabase query result that shows `never` type:

1. Cast immediately after query:
   ```typescript
   const { data: result } = await supabase.from('table').select('*').single();
   const typedResult = result as any;
   ```

2. Use typed result throughout:
   ```typescript
   await supabase.from('other').update({}).eq('id', typedResult.user_id);
   ```

## Global Type Declaration

A global type declaration file has been created at:
`src/types/supabase-global.d.ts`

This extends Supabase types to be more permissive, but you may still need to use type assertions in some cases.
