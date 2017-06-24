const { GraphQLNonNull, GraphQLString } = require("graphql");
const nullableIf = (condition, Type) =>
  condition ? Type : new GraphQLNonNull(Type);
module.exports = function PgColumnsPlugin(
  builder,
  { pgInflection: inflection }
) {
  builder.hook(
    "objectType:fields",
    (
      fields,
      {
        extend,
        pgGqlTypeByTypeId: gqlTypeByTypeId,
        pgIntrospectionResultsByKind: introspectionResultsByKind,
        pgSql: sql,
        parseResolveInfo,
      },
      {
        scope: { isPgRowType, pgIntrospection: table },
        addDataGeneratorForField,
      }
    ) => {
      if (!isPgRowType || !table || table.kind !== "class") {
        return fields;
      }
      return extend(
        fields,
        introspectionResultsByKind.attribute
          .filter(attr => attr.classId === table.id)
          .reduce((memo, attr) => {
            /*
            attr =
              { kind: 'attribute',
                classId: '6546809',
                num: 21,
                name: 'upstreamName',
                description: null,
                typeId: '6484393',
                isNotNull: false,
                hasDefault: false }
            */
            const fieldName = inflection.column(
              attr.name,
              table.name,
              table.namespace.name
            );
            addDataGeneratorForField(fieldName, ({ alias }) => {
              return {
                pgQuery: queryBuilder => {
                  queryBuilder.select(
                    sql.identifier(queryBuilder.getTableAlias(), attr.name),
                    alias
                  );
                },
              };
            });
            memo[fieldName] = {
              type: nullableIf(
                !attr.isNotNull,
                gqlTypeByTypeId[attr.typeId] || GraphQLString
              ),
              resolve: (data, _args, _context, resolveInfo) => {
                const { alias } = parseResolveInfo(resolveInfo, {
                  deep: false,
                });
                return data[alias];
              },
            };
            return memo;
          }, {})
      );
    }
  );
};