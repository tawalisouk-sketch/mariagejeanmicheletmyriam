# Jean-Michel & Miryam — Invitation de mariage (invitations individuelles)

- `index.html` : l'invitation (carte d'ouverture, musique, compte à rebours sous l'accueil, défilement automatique, galerie, RSVP, programme)
- `liens.html` : génère un lien personnel par invité (nom affiché sur la carte d'ouverture, pré-rempli dans le formulaire)
- `admin.html` : liste des invités + liens individuels, qui est en ligne, qui a ouvert, réponses RSVP, export CSV
- `server.js` : serveur Node (RSVP -> data.json, invités -> invites.json, ouvertures -> opens.json)
- `assets/` : photos, `musique.mp3` (ouverture), `musique2.mp3` (à partir de « Confirmer votre présence »)

## Renseigner les dates / lieux
Dans `index.html`, bloc `EVENTS` en haut du <script> (dates, heures, lieux) et `CONTACTS`.
Tant que `date` vaut `null`, la page affiche « Date et lieu à confirmer ».

## Invitation individuelle
Lien d'un invité : https://votre-site/?invite=Nom+Prénom  (voir `liens.html` pour les générer en masse).

## Lancer
    node server.js   # http://localhost:3000
Mot de passe admin : variable ADMIN_KEY (défaut "change-moi" : À CHANGER).
