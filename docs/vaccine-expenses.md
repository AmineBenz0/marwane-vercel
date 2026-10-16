# Dépenses de vaccins dans la saisie journalière

La migration Alembic `daily_vaccine_expenses` ajoute le catalogue `vaccins`
et les détails des dépenses de vaccination dans `charges`. Les 13 noms de la
liste fournie sont initialisés sans prix par défaut. L'unité est générique
(`unité`) tant que les conditionnements ne sont pas renseignés.

Le formulaire charge le catalogue via `GET /api/v1/vaccins`. Chaque ligne
comporte un vaccin, une quantité, un prix unitaire modifiable et une caisse ou
un compte bancaire. Le total est calculé côté serveur avec Decimal, arrondi au
centime (ROUND_HALF_UP). Quand un nouveau vaccin n'a pas encore de tarif par
défaut, le premier prix saisi devient son tarif pour les prochaines saisies.
Pour une dépense existante, l'utilisateur peut choisir d'enregistrer un prix
modifié comme nouveau tarif par défaut. Dans tous les cas, le nom, l'unité et
le prix appliqués restent conservés dans chaque dépense.

Les endpoints `/api/v1/productions/daily` enregistrent la production et les
dépenses dans une seule transaction. Ils acceptent une journée sans collecte,
contenant uniquement une dépense. Les réponses contiennent les lignes de
dépenses et `charge_versions`, à renvoyer lors d'une modification/annulation.
Un conflit renvoie 409 sans modifier les données.

Les corrections utilisent le service financier existant pour remplacer le
mouvement précédent. Retirer une ligne ou annuler la journée inverse son
impact financier. Les lignes liées sont consultables dans le registre des
dépenses, mais se corrigent depuis la journée du bâtiment afin de conserver
la cohérence entre la production, les prix et les débits.

La migration active RLS sur le catalogue, révoque l'accès public et accorde
la lecture au rôle serveur `app_runtime`. Le catalogue et les dépenses
restent accessibles uniquement via l'API authentifiée de l'application.

Pour le staging, appliquer la révision Alembic sur la base `marwane-staging`
puis déployer la branche `codex/fix-vercel-qa`. Ne pas utiliser les scripts
d'initialisation historiques en remplacement de la migration.

La branche de préparation `codex/vaccine-expenses-staging` ne déclenche pas
de déploiement automatique : les variables du staging sont propres à
`codex/fix-vercel-qa`, et la migration doit précéder sa mise en service.
