import * as React from 'react';

import {
  createStyles, Theme, withStyles,
} from '@material-ui/core/styles';
import gql from 'graphql-tag';
import { useQuery, useApolloClient } from '@apollo/react-hooks';

import Breadcrumbs from 'components/breadcrumbs/breadcrumbs';
import ClusterContext from 'common/cluster-context';
import { CLUSTER_STATUS_DISCONNECTED } from 'common/vizier-grpc-client-context';
import { argsForVis, getArgTypesForVis } from 'utils/args-utils';
import { ScriptsContext } from 'containers/App/scripts-context';
import { ScriptContext } from 'context/script-context';
import { entityPageForScriptId } from 'components/live-widgets/utils/live-view-params';
import { parseVis } from 'containers/live/vis';
import { EntityType, pxTypetoEntityType } from 'containers/new-command-input/autocomplete-utils';

const LIST_CLUSTERS = gql`
{
  clusters {
    id
    clusterName
    prettyClusterName
    status
  }
}
`;

const AUTOCOMPLETE_FIELD_QUERY = gql`
query getCompletions($input: String, $kind: AutocompleteEntityKind) {
  autocompleteField(input: $input, fieldType: $kind) {
    name
    description
    matchedIndexes
  }
}
`;

const styles = (({ palette, spacing }: Theme) => createStyles({
  root: {
    display: 'flex',
    paddingTop: spacing(1),
    paddingBottom: spacing(1),
    marginRight: spacing(4.5),
    marginLeft: spacing(3),
    marginBottom: spacing(1),
    borderBottom: `1px solid ${palette.foreground.grey2}`,
  },
  spacer: {
    flex: 1,
  },
}));

const LiveViewBreadcrumbs = ({ classes }) => {
  const { loading, data } = useQuery(LIST_CLUSTERS);
  const { selectedCluster, setCluster } = React.useContext(ClusterContext);
  const { scripts } = React.useContext(ScriptsContext);

  const {
    vis, pxl, args, id, liveViewPage, setArgs, execute, setScript,
  } = React.useContext(ScriptContext);

  const client = useApolloClient();
  const getCompletions = React.useCallback((newInput: string, kind: EntityType) => (client.query({
    query: AUTOCOMPLETE_FIELD_QUERY,
    fetchPolicy: 'network-only',
    variables: {
      input: newInput,
      kind,
    },
  })
  ), [client]);

  const scriptIds = React.useMemo(() => [...scripts.keys()], [scripts]);

  if (loading) {
    return (<div>Loading...</div>);
  }

  const entityBreadcrumbs = [];
  const argBreadcrumbs = [];

  // Cluster always goes first in breadcrumbs.
  const clusterName = data.clusters.find((c) => c.id === selectedCluster)?.prettyClusterName || 'unknown cluster';
  const clusterNameToID = {};
  data.clusters.forEach((c) => {
    clusterNameToID[c.prettyClusterName] = c.id;
  });
  entityBreadcrumbs.push({
    title: 'cluster',
    value: clusterName,
    selectable: true,
    // eslint-disable-next-line
    getListItems: async (input) => (data.clusters.filter((c) => c.status !== CLUSTER_STATUS_DISCONNECTED)
      .map((c) => (c.prettyClusterName))
    ),
    onSelect: (input) => {
      setCluster(clusterNameToID[input]);
    },
  });

  // Add args to breadcrumbs.
  const argTypes = getArgTypesForVis(vis);
  // TODO(michelle): We may want to separate non-entity args from the entity args and put them in separate
  // breadcrumbs. For now, they will all go in the same breadcrumbs object.
  Object.entries(args).filter(([argName]) => argName !== 'script').forEach(([argName, argVal]) => {
    const argProps = {
      title: argName,
      value: argVal,
      selectable: true,
      allowTyping: true,
      onSelect: (newVal) => {
        const newArgs = { ...args, [argName]: newVal };
        setArgs(newArgs);
        execute({
          pxl, vis, args: newArgs, id, liveViewPage,
        });
      },
      getListItems: null,
    };
    const entityType = pxTypetoEntityType(argTypes[argName]);
    if (entityType !== 'AEK_UNKNOWN') {
      argProps.getListItems = async (input) => (getCompletions(input, entityType)
        .then((results) => (results.data.autocompleteField.map((suggestion) => (suggestion.name)))));
    }

    // TODO(michelle): Ideally we should just be able to use the entityType to determine whether the
    // arg appears in the argBreadcrumbs. However, some entities still don't have a corresponding entity type
    // (such as nodes), since they are not yet supported in autocomplete. Until that is fixed, this is hard-coded
    // for now.
    if (argName === 'start_time' || argName === 'start') {
      argBreadcrumbs.push(argProps);
    } else {
      entityBreadcrumbs.push(argProps);
    }
  });

  // Add script at end of breadcrumbs.
  // TODO(michelle): Make script editable.
  entityBreadcrumbs.push({
    title: 'script',
    value: id,
    selectable: true,
    allowTyping: true,
    getListItems: async (input) => {
      const value = input?.target?.value;
      if (!value) {
        return scriptIds;
      }
      return scriptIds.filter((id) => id.indexOf(value) >= 0);
    },
    onSelect: (newVal) => {
      const script = scripts.get(newVal);
      const vis = parseVis(script.vis);
      const execArgs = {
        pxl: script.code,
        id: newVal,
        liveViewPage: entityPageForScriptId(newVal),
        args: argsForVis(vis, args),
        vis,
      };
      setScript(execArgs.vis, execArgs.pxl, execArgs.args, execArgs.id, execArgs.liveViewPage);
      execute(execArgs);
    },
  });

  return (
    <div className={classes.root}>
      <Breadcrumbs
        breadcrumbs={entityBreadcrumbs}
      />
      <div className={classes.spacer} />
      <Breadcrumbs
        breadcrumbs={argBreadcrumbs}
      />
    </div>
  );
};

export default withStyles(styles)(LiveViewBreadcrumbs);
