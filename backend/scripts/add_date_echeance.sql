-- Ajoute la colonne date_echeance à la table transactions
-- Si elle existe déjà, cette commande ne fera rien

-- Ajouter la colonne date_echeance
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS date_echeance DATE;

-- Créer un index sur date_echeance pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_transactions_date_echeance 
ON transactions(date_echeance);

-- Vérifier que la colonne a été ajoutée
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' AND column_name = 'date_echeance';

