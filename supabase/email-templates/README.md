# Modèles d'e-mails Margee+ (Supabase)

À coller dans **Supabase → Authentication → Emails → Templates**.
Pour chaque modèle : copier l'**objet** dans *Subject*, et tout le contenu du fichier dans *Message body* (vue Source / HTML), puis **Save**.

| Modèle Supabase | Objet (Subject) | Fichier |
|---|---|---|
| Confirm signup | Confirme ton adresse e-mail · Margee+ | 1-confirmation-inscription.html |
| Reset password | Réinitialise ton mot de passe · Margee+ | 2-mot-de-passe-oublie.html |
| Invite user | Tu es invité(e) dans l'équipe Margee+ | 3-invitation-equipe.html |
| Change email address | Confirme ta nouvelle adresse e-mail · Margee+ | 4-changement-adresse.html |
| Magic link | Ton lien de connexion · Margee+ | 5-lien-de-connexion.html |

Les variables `{{ .ConfirmationURL }}`, `{{ .Email }}` et `{{ .NewEmail }}` sont remplacées par Supabase à l'envoi : ne pas les modifier.
