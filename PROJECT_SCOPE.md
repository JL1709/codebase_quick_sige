# General points
- mvp / local developement first, but in the end I want to use supabase and fly.io, so the local developement must be in a way, that it is no problem at all to later switch to the hosted systems

Die grundsätzliche Idee ist, dass super einach ein SiGe-Plan erstellt werden kann. Es sollte so sein, dass ein Anwender einfach auf Plan erstellen klickt, dann kommt evt. kurz eine Abfrage "frei erstellen" oder anhand von "Fragebogen", ggfs. auch anhand der am Projekt schon hinterlegten angaben zum Projekt (der Fragebogen ist dann vielleicht schon teilweise vorausgefüllt (das kann man auch am Anfang abfragen ob die Projektangaben übernommen werden sollen Ja/Nein)). Dann schaut der Anwender einfach über alle Angaben drüber, und wenn alles passt wird dieser erstellt. Es muss auch eine Projektverwaltung am Anfang geben. Ich erstelle quasi ein Projekt, kann grundsätzliche Projektangaben machen wie Auftraggeber, Bauherr, Planer, Architekt, etc. und auch spezifische Angaben, die dann, wie oben erwähnt wenn gewünscht direkt für die Erstellung des SiGe-Plans herangezogen werden.

Es sollen auch direkt weitere wichtige Dokumente erstellt werden können (Word und PDF). Die Angaben zu diesen Dokumenten gehören auch einfach zu den Projektangaben. Daraus können dann die folgenden Unterlagen erstellt werden.
- Baustellenordnung
- Baustellengrundsätze (basis/baustellengrundsaetze.pdf)
- Alarmplan (basis/alarmplan.pdf)
- Verhalten im Brandfall (basis/braende_verhueten.pdf)
- Aushang „Erste Hilfe“ (basis/erste_hilfe.pdf)
- Übersicht Projektbeteiligte
Hierzu gibt Vorlagen von uns, es können aber auch benutzerspezifische Vorlagen erstellt werden. Und das für alles mögliche. Hier könnten wir mit Placeholdern im Word-Template arbeiten. Diese werden dann ganz einfach mit den am Projekt gemachten Angaben ersetzt, wenn ein Dokument erstellt werdne soll.

Diese können dann separat erstellt werden und diese können auch auf den SiGePlan kommen, je nach Bedarf, zusätzlich zu den Bausteinen (siehe basis/old_software_beispiel_SiGePlan.pdf)

Es kann z.B. auch noch ein Lageplan oder was auch immer hochgeladen werden und auf den SiGePlan bei Bedarf abgebildet werden.

D.h. der SiGeplan muss ein interaktiver canvas sein. Das vermutlich am häufigste verwendete Format wird A0 sein, es sollten aber auch A1 oder A2, etc. möglich sein. Es wird also ein erster Entwurf erstellt und dieser kann dann interaktiv verschoben, ergänzt, etc werden (basis/old_software_interface_of_one_old_solution.png). Links ist der Bausteinkatalog abgebildet, sodass ganz einfach Bausteine entweder per Drag & Drop oder per hinterlegter Kategorisierung mit eingebunden werden können.
Dieser kann dann natürlich als PDF exportiert werden.
Dann gibt es noch das wichtige Feature "Word erstellen". Hier wird dann aus den Bausteinen des A0-Plans ein Word-Dokument (A4) erstellt (basis/old_software_word_export_example.png)

Ich habe für den ersten MVP mal eine kleine Datenbasis erstellt, die herangezogen werden kann für die Erstellung des Plans (building_blocks.json)





