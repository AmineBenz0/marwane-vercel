from decimal import Decimal
from pydantic import BaseModel, model_validator
from typing import Optional

class TransactionUpdate(BaseModel):
    quantite: Optional[int] = None
    prix_unitaire: Optional[Decimal] = None
    montant_total: Optional[Decimal] = None

    @model_validator(mode='after')
    def calculate_montant_total(self):
        qty = self.quantite
        price = self.prix_unitaire
        if qty is not None and price is not None:
            self.montant_total = Decimal(str(qty)) * price
        return self

# Test partial update (Standard FastAPI case)
update = TransactionUpdate(quantite=10)
print(f"Partial update (qty=10): {update.model_dump(exclude_unset=True)}")

# Test full object merge (Safe logic case)
full_state = TransactionUpdate(quantite=5, prix_unitaire=Decimal('10'), montant_total=Decimal('50'))
updated_state = full_state.model_copy(update={'quantite': 10})
# The model_copy doesn't trigger validators unfortunately by default in v2 unless we use something else?
# Actually, let's just re-validate.
final_state = TransactionUpdate.model_validate(updated_state.model_dump())
print(f"Full state after qty update (5->10): {final_state.model_dump()}")
