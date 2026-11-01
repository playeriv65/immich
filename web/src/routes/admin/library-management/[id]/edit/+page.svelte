<script lang="ts">
  import { goto } from '$app/navigation';
  import { createPreloadedQuery, executeMutation } from '#lib/queries/client.ts';
  import { getLibraryQuery, updateLibraryMutation } from '#lib/queries/library.query.ts';
  import { Route } from '#lib/route.ts';
  import { Field, FormModal, Input, Switch } from '@immich/ui';
  import { mdiRenameOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageProps } from './$types';

  const { params }: PageProps = $props();

  const query = createPreloadedQuery(() => getLibraryQuery(params.id));
  const library = $derived(query.data);
  let name = $derived(library.name);
  let allowOffline = $state(library.allowOffline ?? false);
  let storageChecks = $state(
    library.importPaths.map((importPath) => ({
      importPath,
      markerPath: library.storageChecks?.find((check) => check.importPath === importPath)?.markerPath ?? '',
      expectedValue: library.storageChecks?.find((check) => check.importPath === importPath)?.expectedValue ?? '',
    })),
  );

  const onClose = () => void goto(Route.viewLibrary(library));

  const onSubmit = async () => {
    await executeMutation(
      updateLibraryMutation,
      [
        {
          id: library.id,
          updateLibraryDto: {
            name,
            allowOffline,
            storageChecks: storageChecks.filter((check) => check.markerPath && check.expectedValue),
          },
        },
      ],
      {
        onSuccess: onClose,
      },
    );
  };
</script>

<FormModal icon={mdiRenameOutline} title={$t('edit')} {onSubmit} {onClose} size="small">
  <Field label={$t('name')}>
    <Input bind:value={name} />
  </Field>
  <Field label={$t('admin.library_allow_offline')}>
    <Switch bind:checked={allowOffline} />
    <p class="text-sm">{$t('admin.library_allow_offline_description')}</p>
  </Field>
  {#if allowOffline}
    {#each storageChecks as check (check.importPath)}
      <Field label={`${$t('admin.library_storage_marker')}: ${check.importPath}`}>
        <Input bind:value={check.markerPath} required />
      </Field>
      <Field label={$t('admin.library_storage_marker_value')}>
        <Input bind:value={check.expectedValue} required={!!check.markerPath} />
      </Field>
    {/each}
  {/if}
</FormModal>
